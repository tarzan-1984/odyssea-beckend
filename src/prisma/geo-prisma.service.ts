import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/geo-client';
import { withPrismaPoolParams } from './prisma-database-url.util';

/** Geo DB is queried during location bursts; keep a small dedicated pool. */
const GEO_DB_CONNECTION_LIMIT = 4;
const GEO_DB_CONNECT_MAX_ATTEMPTS = 3;
const GEO_DB_CONNECT_RETRY_DELAY_MS = 2_000;

@Injectable()
export class GeoPrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(GeoPrismaService.name);
	private connected = false;

	constructor() {
		const databaseUrl = withPrismaPoolParams(process.env.GEO_DATABASE_URL, {
			connectionLimit: GEO_DB_CONNECTION_LIMIT,
			poolTimeoutSeconds: 20,
			connectTimeoutSeconds: 15,
		});

		super({
			datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
			log:
				process.env.PRISMA_LOG_LEVEL === 'warn'
					? ['error', 'warn']
					: ['error'],
		});
	}

	get isConnected(): boolean {
		return this.connected;
	}

	async onModuleInit(): Promise<void> {
		const databaseUrl = process.env.GEO_DATABASE_URL?.trim();
		if (!databaseUrl) {
			this.logger.warn(
				'GEO_DATABASE_URL is not set — geo database connection disabled',
			);
			return;
		}

		if (
			!databaseUrl.startsWith('postgresql://') &&
			!databaseUrl.startsWith('postgres://')
		) {
			throw new Error(
				'Invalid GEO_DATABASE_URL format. Expected postgresql:// or postgres://',
			);
		}

		for (let attempt = 1; attempt <= GEO_DB_CONNECT_MAX_ATTEMPTS; attempt++) {
			try {
				this.logger.log(
					`Connecting to geo database (attempt ${attempt}/${GEO_DB_CONNECT_MAX_ATTEMPTS})...`,
				);
				await this.$connect();
				this.connected = true;
				this.logger.log('Successfully connected to geo database');
				return;
			} catch (error) {
				const message =
					error instanceof Error ? error.message : String(error);
				const isLastAttempt = attempt === GEO_DB_CONNECT_MAX_ATTEMPTS;
				if (isLastAttempt) {
					this.logger.error(
						`Failed to connect to geo database after ${GEO_DB_CONNECT_MAX_ATTEMPTS} attempts: ${message}. ` +
							'App will start without PostGIS geo lookups (Nominatim fallback still works).',
					);
					return;
				}
				this.logger.warn(
					`Geo database connect attempt ${attempt} failed: ${message}. Retrying...`,
				);
				await new Promise((resolve) =>
					setTimeout(resolve, GEO_DB_CONNECT_RETRY_DELAY_MS),
				);
			}
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (!this.connected) {
			return;
		}
		await this.$disconnect();
		this.connected = false;
	}

	/** Lightweight connectivity check (SELECT 1). */
	async ping(): Promise<boolean> {
		if (!this.connected) {
			return false;
		}
		await this.$queryRaw`SELECT 1`;
		return true;
	}
}
