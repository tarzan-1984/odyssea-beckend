/**
 * Create geo_zips table + GIST index on the geo database.
 *
 * Usage:
 *   GEO_DATABASE_URL="postgresql://..." yarn db:migrate:geo-zips
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/geo-client';

async function main(): Promise<void> {
	const url = process.env.GEO_DATABASE_URL?.trim();
	if (!url) {
		throw new Error('GEO_DATABASE_URL is not set');
	}

		const sqlPath = join(__dirname, '../../prisma/sql/create-geo-zips.sql');
		const sql = readFileSync(sqlPath, 'utf8');
		const alterPath = join(
			__dirname,
			'../../prisma/sql/alter-geo-zips-country-code.sql',
		);
		const alterSql = readFileSync(alterPath, 'utf8');

	const prisma = new PrismaClient();
	try {
		await prisma.$connect();
		console.log('Connected to geo database');

		const statements = sql
			.split(';')
			.map((part) => part.trim())
			.filter(Boolean);

		for (const statement of statements) {
			await prisma.$executeRawUnsafe(`${statement};`);
		}
		console.log('Applied prisma/sql/create-geo-zips.sql');

		const alterStatements = alterSql
			.split(';')
			.map((part) => part.trim())
			.filter(Boolean);

		for (const statement of alterStatements) {
			await prisma.$executeRawUnsafe(`${statement};`);
		}
		console.log('Applied prisma/sql/alter-geo-zips-country-code.sql');

		const table = await prisma.$queryRaw<
			Array<{ tablename: string }>
		>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'geo_zips'`;
		if (table.length === 0) {
			throw new Error('geo_zips table was not created');
		}
		console.log('Verified table: geo_zips');

		const index = await prisma.$queryRaw<
			Array<{ indexname: string }>
		>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'geo_zips_geom_idx'`;
		if (index.length === 0) {
			throw new Error('geo_zips_geom_idx index was not created');
		}
		console.log('Verified index: geo_zips_geom_idx');

		const columns = await prisma.$queryRaw<
			Array<{ column_name: string; udt_name: string }>
		>`
			SELECT column_name, udt_name
			FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = 'geo_zips'
			ORDER BY ordinal_position
		`;
		console.log('Columns:');
		for (const col of columns) {
			console.log(`  - ${col.column_name} (${col.udt_name})`);
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Failed to migrate geo_zips: ${message}`);
	process.exit(1);
});
