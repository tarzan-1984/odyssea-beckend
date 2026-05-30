/**
 * Enable PostGIS on the geo database and print its version.
 *
 * Usage:
 *   GEO_DATABASE_URL="postgresql://..." yarn db:postgis:geo
 */
import { PrismaClient } from '@prisma/geo-client';

async function main(): Promise<void> {
	const url = process.env.GEO_DATABASE_URL?.trim();
	if (!url) {
		throw new Error('GEO_DATABASE_URL is not set');
	}

	const prisma = new PrismaClient();
	try {
		await prisma.$connect();
		console.log('Connected to geo database');

		await prisma.$executeRawUnsafe(
			'CREATE EXTENSION IF NOT EXISTS postgis',
		);
		console.log('PostGIS extension enabled (CREATE EXTENSION IF NOT EXISTS postgis)');

		const rows = await prisma.$queryRaw<Array<{ postgis_version: string }>>`
			SELECT PostGIS_Version() AS postgis_version
		`;
		const version = rows[0]?.postgis_version;
		if (!version) {
			throw new Error('PostGIS_Version() returned no result');
		}

		console.log(`PostGIS version: ${version}`);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Failed to enable PostGIS: ${message}`);
	process.exit(1);
});
