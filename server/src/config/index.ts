/** Getters for environment variables */

import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const err = (name: string) => {
	throw new Error(`Missing environment variable: ${ name }`);
};
const env = (key: string) => process.env[key] ?? err(key);

export const PORT = () => env('PORT');
export const STAGE = () => env('STAGE');
export const REGION = () => env('REGION');
export const S3_BUCKET = () => env('S3_BUCKET');
export const INCOMING_JOB_QUEUE = () => env('INCOMING_JOB_QUEUE');
export const DB_HOST = () => env('DB_HOST');
export const DB_PASSWORD = () => env('DB_PASS');
export const DB_USER = () => env('DB_USER');
export const DB_NAME = () => env('DB_NAME');
export const MAX_JOB_CONCURRENCY = (): number => {
	const max = parseInt(env('MAX_JOB_CONCURRENCY') ?? '1');
	if (isNaN(max) || max < 1) throw new Error('Invalid MAX_JOB_CONCURRENCY');
	return max;
};