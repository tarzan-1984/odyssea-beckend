import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { formatTmsStatusDate } from './tms-status-date.util';
import {
	TmsBatchLocationItem,
	TmsDriverLocationBatchService,
} from './tms-driver-location-batch.service';
import type { ExternalApiConfig } from '../config/env.config';

/** Advisory lock keys — only this job uses them. */
const ADV_LOCK_KEY1 = 872_001;
const ADV_LOCK_KEY2 = 330_029;

/** Poll frequently enough so any configured interval (≥ 60s) is respected. */
const TICK_CRON = '*/15 * * * * *';

@Injectable()
export class TmsLocationBatchScheduler {
	private readonly logger = new Logger(TmsLocationBatchScheduler.name);
	/** Last time a full batch run completed (ms). */
	private lastRunAtMs = 0;

	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
		private readonly appSettingsService: AppSettingsService,
		private readonly batchService: TmsDriverLocationBatchService,
	) {}

	@Cron(TICK_CRON, { name: 'tms-driver-location-batch-tick' })
	async onTick(): Promise<void> {
		const extApi = this.configService.get<ExternalApiConfig>('externalApi');
		if (!extApi?.tmsLocationBatchCronEnabled) {
			return;
		}
		if (extApi.skipTmsDriverLocationSync) {
			return;
		}
		if (!this.configService.get<string>('externalApi.tmsApiKey')) {
			return;
		}

		const settings = await this.appSettingsService.getGlobal();
		const intervalSec = settings.tmsBatchCronIntervalSeconds;
		const now = Date.now();
		if (
			this.lastRunAtMs > 0 &&
			now - this.lastRunAtMs < intervalSec * 1000
		) {
			return;
		}

		const chunkSize = Math.min(
			500,
			Math.max(1, settings.tmsBatchChunkSize),
		);

		const ran = await this.runTmsLocationBatch(chunkSize);
		if (ran) {
			this.lastRunAtMs = Date.now();
		}
	}

	/**
	 * @returns true if a run was attempted (including empty driver list after acquiring lock).
	 */
	private async runTmsLocationBatch(chunkSize: number): Promise<boolean> {
		const rows = await this.prisma.$queryRawUnsafe<{ got: boolean }[]>(
			'SELECT pg_try_advisory_lock($1::int, $2::int) AS got',
			ADV_LOCK_KEY1,
			ADV_LOCK_KEY2,
		);
		const gotLock = rows[0]?.got === true;
		if (!gotLock) {
			this.logger.warn(
				'TMS batch cron skipped: another instance is already running this job',
			);
			return false;
		}

		try {
			const drivers = await this.prisma.user.findMany({
				where: {
					role: UserRole.DRIVER,
					isAutoupdate: true,
					externalId: { not: null },
					latitude: { not: null },
					longitude: { not: null },
				},
				select: {
					externalId: true,
					latitude: true,
					longitude: true,
					city: true,
					state: true,
					zip: true,
					driverStatus: true,
					statusDate: true,
				},
				orderBy: { id: 'asc' },
			});

			const items: TmsBatchLocationItem[] = [];
			for (const u of drivers) {
				const ext = u.externalId?.trim();
				if (!ext) continue;
				const driverId = this.parseDriverId(ext);
				if (driverId === null) {
					this.logger.warn(
						`TMS batch: skip driver externalId not numeric: ${ext}`,
					);
					continue;
				}
				const lat = u.latitude as number;
				const lng = u.longitude as number;
				items.push({
					driver_id: driverId,
					latitude: String(lat),
					longitude: String(lng),
					current_city: u.city?.trim() || 'New York',
					current_location: u.state?.trim() || 'NY',
					current_zipcode: u.zip?.trim() || '',
					driver_status: u.driverStatus?.trim() ?? '',
					status_date: formatTmsStatusDate(u.statusDate),
					country: 'USA',
					current_country: 'USA',
					notes: 'Batch update',
				});
			}

			if (items.length === 0) {
				this.logger.log('TMS batch: no drivers with autoupdate + coordinates');
				return true;
			}

			const chunks: TmsBatchLocationItem[][] = [];
			for (let i = 0; i < items.length; i += chunkSize) {
				chunks.push(items.slice(i, i + chunkSize));
			}

			let ok = 0;
			let failed = 0;
			for (let i = 0; i < chunks.length; i++) {
				const batch = chunks[i];
				try {
					await this.batchService.sendBatch(batch);
					ok++;
				} catch (e) {
					failed++;
					const msg = e instanceof Error ? e.message : String(e);
					this.logger.error(
						`TMS batch chunk ${i + 1}/${chunks.length} failed (${batch.length} drivers): ${msg}`,
					);
				}
			}

			this.logger.log(
				`TMS batch cron finished: ${items.length} drivers, ${chunks.length} chunk(s), ${ok} OK, ${failed} failed`,
			);
			return true;
		} finally {
			await this.prisma.$executeRawUnsafe(
				'SELECT pg_advisory_unlock($1::int, $2::int)',
				ADV_LOCK_KEY1,
				ADV_LOCK_KEY2,
			);
		}
	}

	private parseDriverId(externalId: string): number | null {
		if (/^\d+$/.test(externalId)) {
			return parseInt(externalId, 10);
		}
		return null;
	}
}
