import { config as c } from 'dotenv';

c({ path: '../.env' });

console.log(process.env.DB_NAME);

/** Knex's configuration used by CLI only */
const config = {
	client: 'mysql2',
	connection: {
		database: process.env.DB_NAME,
		host: process.env.DB_HOST,
		user: process.env.DB_USER,
		password: process.env.DB_PASS
	},
	migrations: {
		directory: './migrations'
	}
};

export default config;