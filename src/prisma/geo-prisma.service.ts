import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/geo-client';

@Injectable()
export class GeoPrismaService
	extends PrismaClient
	implements OnModuleInit, OnModuleDestroy
{
	private readonly logger = new Logger(GeoPrismaService.name);
	private connected = false;

	constructor() {
		super({
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

		try {
			this.logger.log('Connecting to geo database...');
			await this.$connect();
			this.connected = true;
			this.logger.log('Successfully connected to geo database');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.logger.error(`Failed to connect to geo database: ${message}`);
			throw error;
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
