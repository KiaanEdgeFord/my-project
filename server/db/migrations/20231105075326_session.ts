import { Knex } from 'knex';


export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('session', table => {
		table.string('id').primary();
		table.string('file').notNullable();
		table.string('upload').notNullable();
		table.string('download').nullable();
		table.integer('width').nullable();
		table.integer('height').nullable();
		table.timestamps(true, true);
	});
}


export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('session');
}

