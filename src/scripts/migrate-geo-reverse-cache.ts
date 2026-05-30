/**
 * Create geo_reverse_cache table on the geo database.
 *
 * Usage:
 *   GEO_DATABASE_URL="postgresql://..." yarn db:migrate:geo-reverse-cache
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/geo-client';

async function main(): Promise<void> {
	const url = process.env.GEO_DATABASE_URL?.trim();
	if (!url) {
		throw new Error('GEO_DATABASE_URL is not set');
	}

	const sqlPath = join(
		__dirname,
		'../../prisma/sql/create-geo-reverse-cache.sql',
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
		console.log('Applied prisma/sql/create-geo-reverse-cache.sql');
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Failed to migrate geo_reverse_cache: ${message}`);
	process.exit(1);
});
