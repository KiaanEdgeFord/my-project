import express from 'express';
import cors from 'cors';
import { PORT, REGION, S3_BUCKET, DB_NAME, DB_HOST, DB_USER, DB_PASSWORD } from './config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { queryJobQueue } from './processing';
import knex from 'knex';
import cleanup from './util/cleanup';
import morgan from 'morgan';

/** Extension to include types for session identifier */
declare global {
	namespace Express {
		interface Request {
			session: { id: string; };
		}
	}
}

const s3Client = new S3Client({ region: REGION() });

const app = express();

/** Knex instance */
export const db = knex({
	client: 'mysql2',
	connection: {
		database: DB_NAME(),
		host: DB_HOST(),
		user: DB_USER(),
		password: DB_PASSWORD()
	},
	pool: { min: 0, max: 10 }
});


/** Middleware */
app
	.use(cors())
	.use(express.urlencoded({ extended: true }))
	.use(express.json())
	.use(morgan('dev'))
	// Session initialisation (Insecure)
	.use((req, res, next) => {
		const id = req.headers?.['identifier']?.toString() ?? '';
		if (!id) return res.status(401).json({ message: 'No identifier provided' });
		req.session = { id };
		next();
	});


/** Accepts an array of file names and returns a mapped list of file names and pre-signed upload URLs */
app.put('/upload', async (req, res) => {

	// Validate files
	const { files } = req.body;
	if (!files || !Array.isArray(files) || files.length === 0)
		return res.status(400).json({ message: 'No files provided' });
	if (files.length > 1000) return res.status(400).json({ message: 'Too many files' });
	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		if (
			typeof file !== 'string' ||
			file.length > 100 ||
			file.length < 2 ||
			file.endsWith('/')
		) return res.status(400).json({ message: `Invalid file name detected: ${ file }` });
	}

	// Validate options
	const { options } = req.body;
	if (options) {
		if (typeof options !== 'object')
			return res.status(400).json({ message: 'Invalid options provided' });
		if (options.width && (typeof options.width !== 'number' || options.width < 1))
			return res.status(400).json({ message: 'Invalid width provided' });
		if (options.height && (typeof options.height !== 'number' || options.height < 1))
			return res.status(400).json({ message: 'Invalid height provided' });
	}

	// Session & files are valid
	if (!req.session.id || !req.session.id.length)
		return res.status(500).json({ message: 'Invalid session' });

	const promises = files.map(async file => {
		const upload = await getSignedUrl(
			s3Client,
			new PutObjectCommand({
				Bucket: S3_BUCKET(),
				Key: `jobs/input/${ req.session.id }/${ file }`
			})
		);
		return ({ upload, file });
	});

	// Wait for all promises to resolve
	const results = await Promise.all(promises);

	await db.transaction(async trx => {
		// Purge any existing session data
		await trx('job').where({ session_id: req.session.id }).del();
		// Store the session in the database
		await trx('job').insert(results.map(r => ({
			session_id: req.session.id,
			file: r.file,
			upload: r.upload,
			width: options?.width ?? null,
			height: options?.height ?? null
		})));
	})
		.catch(e => {
			console.error(e);
			return res.status(500).json({ message: 'Internal server error' });
		});

	res.json({ results });
});

interface InitJobItem {
	file: string;
	download: string;
}

type InitResponse = InitJobItem[];

/** Gets all download URLs for any existing session in the case of refresh during processing */
app.get('/download', async (req, res) => {

	const results: InitResponse = await db('job')
		.where({ session_id: req.session.id })
		.select('file', 'download', 'upload')
		.catch(e => {
			console.error(e);
			return [];
		});

	res.json(results);
});


/** Kick-off job allocation and image processing in the background */
setInterval(queryJobQueue, 2000);

/** Initiate cleanup cycle */
setInterval(cleanup, 1000 * 60 * 60 * 24);

app.listen(PORT(), () => console.log(`Server is listening on port ${ PORT() }`));