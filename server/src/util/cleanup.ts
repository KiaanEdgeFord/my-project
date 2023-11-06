import { Knex } from 'knex';


const cleanup = async (db: Knex): Promise<void> => {

	console.log('Running cleanup...');

	// Delete any sessions older than 24 hours
	await db('job')
		.where('created_at', '<', db.raw('NOW() - INTERVAL 1 DAY'))
		.del()
		.catch(console.error);

	// Files are automatically expired by S3 lifecycle policy
};

export default cleanup;