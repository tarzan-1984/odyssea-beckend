/**
 * Create optimized geo_zips indexes on the geo database.
 *
 * Usage:
 *   GEO_DATABASE_URL="postgresql://..." yarn db:migrate:geo-zips-indexes
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/geo-client';

const EXPECTED_INDEXES = [
	'geo_zips_geom_us_idx',
	'geo_zips_geom_ca_idx',
	'geo_zips_geom_mx_idx',
] as const;

async function main(): Promise<void> {
	const url = process.env.GEO_DATABASE_URL?.trim();
	if (!url) {
		throw new Error('GEO_DATABASE_URL is not set');
	}

	const sqlPath = join(
		__dirname,
		'../../prisma/sql/indexes-geo-zips-optimize.sql',
	);
	const sql = readFileSync(sqlPath, 'utf8');

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
		console.log('Applied prisma/sql/indexes-geo-zips-optimize.sql');

		for (const indexName of EXPECTED_INDEXES) {
			const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
				SELECT indexname
				FROM pg_indexes
				WHERE schemaname = 'public' AND indexname = ${indexName}
			`;
			if (rows.length === 0) {
				throw new Error(`Index was not created: ${indexName}`);
			}
			console.log(`Verified index: ${indexName}`);
		}
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Failed to migrate geo_zips indexes: ${message}`);
	process.exit(1);
});
