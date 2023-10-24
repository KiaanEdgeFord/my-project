/** Getters for environment variables */

import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const err = (name) => { throw new Error(`Missing environment variable: ${ name }`); };
const env = (key) => process.env[key] ?? err(key);

export const PORT = () => env('PORT');
export const STAGE = () => env('STAGE');