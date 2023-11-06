import { C } from '../util/console';
import { INCOMING_JOB_QUEUE, MAX_JOB_CONCURRENCY, REGION, S3_BUCKET } from '../config';
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import Job from './Job';
import { Readable } from 'stream';
import sharp from 'sharp';
import { db } from '../index';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const sqsClient = new SQSClient({ region: REGION() });
const s3Client = new S3Client({ region: REGION() });

/** Temporary job cache */
let jobs: Job[] = [];

/** Temporary failed job cache */
const failedJobs: Job[] = [];

/** Job allocation timeout handler */
export const queryJobQueue = async () => {
	if (jobs.length >= MAX_JOB_CONCURRENCY()) return;

	// Get new jobs
	const newJobs = await getJobs(1);

	// Process all new jobs concurrently
	if (newJobs.length) Promise.all(newJobs.map(async job => {
		if (jobs.find(j => j.id === job.id)) return;
		job.start();
		jobs.push(job);
		const k = job.key.split('/').pop();
		console.log(`${ C.RESET + C.BLUE }JOB ALLOCATED [${ jobs.length }]: ${ C.RESET }${ k }`);
		await processJob(job)
			.then(() => {
				console.log(`${ C.RESET + C.GREEN }JOB COMPLETED [${ jobs.length - 1 }]: ${ C.RESET }${ k } (${ job.stop() })`);
			})
			.catch((e) => {
				console.log(`${ C.RESET + C.RED_BR }JOB FAILED: ${ C.RESET }${ k } (${ job.stop() })`);
				console.error(e);
				const i = failedJobs.findIndex(j => j.id === job.id);
				if (i === -1) failedJobs.push(job);
				else {
					failedJobs[i].failures++;
					if (failedJobs[i].failures > 2) abortJob(job);
				}
			})
			.finally(() => {
				jobs = jobs.filter(j => j.id !== job.id);
			});
	}))
		.catch(console.error);
};


/** Aborts a job after a number of failed processing attempts */
const abortJob = async (job: Job) => {
	try {
		// Delete the original file
		await s3Client.send(new DeleteObjectCommand({
			Bucket: S3_BUCKET(),
			Key: job.key
		}));

		// Delete the message from the SQS queue to mark the job as completed
		await deleteJob(job.receipt);
		console.log(`${ C.RESET + C.YELLOW }JOB ABORTED: ${ C.RESET }${ job.key }`);
	} catch (e) {
		// If the job fails to abort, terminate the instance to prevent infinite loop
		console.log(`${ C.RESET + C.RED_BR }CRITICAL ERROR ENCOUNTERED: ${ C.RESET }${ job.key }`);
		process.exit(1);
	}
};

/** Queries SQS for un-processed jobs */
const getJobs = async (n: number = 1): Promise<Job[]> => {

	// Get messages from SQS
	const data = await sqsClient.send(
		new ReceiveMessageCommand({
			QueueUrl: INCOMING_JOB_QUEUE(),
			MaxNumberOfMessages: n
		})
	);

	// Validate messages and create jobs
	const jobBuffer: Job[] = [];
	for (let i = 0; i < (data.Messages ?? []).length; i++) {
		const msg = data.Messages?.[i];
		if (!msg) continue;
		const receipt = msg.ReceiptHandle;
		const id = msg.MessageId;
		if (!receipt || !id) {
			console.log('Invalid message detected', msg);
			continue;
		}
		try {
			const body = JSON.parse(msg.Body ?? '{ "Records": []}');
			const k = body.Records?.[0]?.s3?.object?.key;
			if (!k || typeof k !== 'string' || !k.startsWith('jobs/input/')) throw new Error('Invalid key');
			const key = decodeURIComponent(k.replace(/\+/g, ' '));
			const createdAt = new Date(body.Records?.[0]?.eventTime);
			if (isNaN(createdAt.getTime())) throw new Error('Invalid date');
			const size = parseInt(body.Records?.[0]?.s3?.object?.size ?? '0');
			if (isNaN(size)) throw new Error('Invalid size');
			// Create a validated job
			jobBuffer.push(new Job({ id, key, receipt, size }));
		} catch (e) {
			console.error(e);
			// Delete invalid jobs to prevent infinite loop
			await deleteJob(receipt);
		}
	}
	return jobBuffer;
};


/** Deletes a job from the queue */
const deleteJob = async (receipt: string) => sqsClient.send(
	new DeleteMessageCommand({
		QueueUrl: INCOMING_JOB_QUEUE(),
		ReceiptHandle: receipt
	})
);


/** Process an individual job */
const processJob = async (job: Job) => {

	// Get the original s3 object
	const { Body } = await s3Client.send(new GetObjectCommand({
		Bucket: S3_BUCKET(),
		Key: job.key
	}));

	// Type-narrow the response body to a Readable stream
	if (!Body || !(Body instanceof Readable))
		throw new Error('Invalid S3 response body');
	const bodyContents = await streamToBuffer(Body);

	// Get the job options from the database
	let { width, height, id } = await db('job')
		.where({
			session_id: job.session(),
			file: job.key.split('/').pop()
		})
		.select('width', 'height', 'id')
		.first()
		.catch(e => {
			console.error(e);
			return {};
		});

	if (typeof width !== 'number') width = undefined;
	if (typeof height !== 'number') height = undefined;

	// Process the image
	const processedImage = await sharp(bodyContents)
		.resize({
			width,
			height,
			fit: 'fill',
			position: 'center',
			kernel: sharp.kernel.cubic
		})
		.jpeg({ quality: 10 })
		.toBuffer();

	// Upload the compressed file to S3
	await s3Client.send(new PutObjectCommand({
		Bucket: S3_BUCKET(),
		Key: job.key.replace('input', 'output'),
		Body: processedImage
	}));

	// Delete original file from S3
	await s3Client.send(new DeleteObjectCommand({
		Bucket: S3_BUCKET(),
		Key: job.key
	}));

	// Get the download URL for the processed file
	const download = await getSignedUrl(
		s3Client,
		new GetObjectCommand({
			Bucket: S3_BUCKET(),
			Key: job.key.replace('input', 'output')
		})
	);

	// Update the job in the database so the client can download the file
	await db('job')
		.where({ id })
		.update({ download });

	// Delete the message from the SQS queue to mark the job as completed
	await sqsClient.send(new DeleteMessageCommand({
		QueueUrl: INCOMING_JOB_QUEUE(),
		ReceiptHandle: job.receipt
	}));

};


/** Helper function to convert a readable stream to a buffer */
function streamToBuffer(stream: Readable): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on('data', (chunk) => chunks.push(chunk));
		stream.on('error', reject);
		stream.on('end', () => resolve(Buffer.concat(chunks)));
	});
}