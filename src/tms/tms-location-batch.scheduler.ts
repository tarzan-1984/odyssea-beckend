import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { formatTmsStatusDate } from './tms-status-date.util';
import {
	TmsBatchLocationItem,
	TmsDriverLocationBatchService,
	parseTmsDriverIdFromExternalId,
} from './tms-driver-location-batch.service';
import type { ExternalApiConfig } from '../config/env.config';
import { normalizeTmsCurrentLocation } from './tms-current-location.util';

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
	/** Throttle "cooldown" logs so operators see the scheduler is alive between runs. */
	private lastCooldownLogAtMs = 0;

	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
		private readonly appSettingsService: AppSettingsService,
		private readonly batchService: TmsDriverLocationBatchService,
	) {}

	@Cron(TICK_CRON, { name: 'tms-driver-location-batch-tick' })
	async onTick(): Promise<void> {
		return;
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
			const remainingSec = Math.ceil(
				(intervalSec * 1000 - (now - this.lastRunAtMs)) / 1000,
			);
			if (now - this.lastCooldownLogAtMs >= 90_000) {
				this.lastCooldownLogAtMs = now;
				this.logger.log(
					`TMS batch: cooldown — next sync run in ~${remainingSec}s (tick every 15s, interval=${intervalSec}s from last run end)`,
				);
			}
			return;
		}

		const chunkSize = Math.min(
			500,
			Math.max(1, settings.tmsBatchChunkSize),
		);

		this.logger.log(
			`TMS batch: starting sync run (interval=${intervalSec}s, chunkSize=${chunkSize}, next runs every ${intervalSec}s after this run completes)`,
		);

		const ran = await this.runTmsLocationBatch(chunkSize, intervalSec);
		if (ran) {
			this.lastRunAtMs = Date.now();
		}
	}

	/**
	 * @returns true if a run was attempted (including empty driver list after acquiring lock).
	 */
	private async runTmsLocationBatch(
		chunkSize: number,
		intervalSec: number,
	): Promise<boolean> {
		const runId = `tms-batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

		const rows = await this.prisma.$queryRawUnsafe<{ got: boolean }[]>(
			'SELECT pg_try_advisory_lock($1::int, $2::int) AS got',
			ADV_LOCK_KEY1,
			ADV_LOCK_KEY2,
		);
		const gotLock = rows[0]?.got === true;
		if (!gotLock) {
			this.logger.warn(
				`[${runId}] TMS batch: skipped — another instance holds the lock (this job already running elsewhere)`,
			);
			return false;
		}

		this.logger.log(
			`[${runId}] TMS batch: lock acquired — loading drivers (chunkSize=${chunkSize}, interval=${intervalSec}s)`,
		);

		try {
			const driversFromDb = await this.prisma.user.findMany({
				where: {
					role: UserRole.DRIVER,
					status: UserStatus.ACTIVE,
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

			const globalRow = await this.appSettingsService.getGlobal();
			const isTestEnv = globalRow.locationEnvironmentMode === 'test';
			const testExtId = globalRow.locationTestDriverExternalId.trim();
			const drivers = isTestEnv
				? driversFromDb.filter(
						(u) => u.externalId?.trim() === testExtId,
					)
				: driversFromDb;

			if (isTestEnv) {
				this.logger.log(
					`[${runId}] TMS batch: test mode — only externalId=${testExtId} (${drivers.length} row(s), ${driversFromDb.length} before filter)`,
				);
			}

			this.logger.log(
				`[${runId}] TMS batch: ${drivers.length} driver row(s) from DB (ACTIVE, isAutoupdate, has coords, has externalId)`,
			);

			const items: TmsBatchLocationItem[] = [];
			for (const u of drivers) {
				const ext = u.externalId?.trim();
				if (!ext) continue;
				const driverId = parseTmsDriverIdFromExternalId(ext);
				if (driverId === null) {
					this.logger.warn(
						`[${runId}] TMS batch: skip driver externalId not numeric: ${ext}`,
					);
					continue;
				}
				const cityTrimmed = u.city?.trim() ?? '';
				if (!cityTrimmed) {
					this.logger.warn(
						`[${runId}] TMS batch: skip driver — empty city (externalId=${ext})`,
					);
					continue;
				}
				const lat = u.latitude as number;
				const lng = u.longitude as number;
				items.push({
					driver_id: driverId,
					latitude: String(lat),
					longitude: String(lng),
					current_city: cityTrimmed,
					current_location: normalizeTmsCurrentLocation(u.state),
					current_zipcode: u.zip?.trim() || '',
					driver_status: u.driverStatus?.trim() ?? '',
					status_date: formatTmsStatusDate(u.statusDate),
					country: 'USA',
					current_country: 'USA',
					notes: '',
				});
			}

			if (items.length === 0) {
				this.logger.log(
					`[${runId}] TMS batch: no items to send (0 drivers with numeric externalId after filter) — run complete`,
				);
				return true;
			}

			const chunks: TmsBatchLocationItem[][] = [];
			for (let i = 0; i < items.length; i += chunkSize) {
				chunks.push(items.slice(i, i + chunkSize));
			}

			this.logger.log(
				`[${runId}] TMS batch: sending ${items.length} driver(s) in ${chunks.length} HTTP batch(es) to TMS (max ${chunkSize} per request)`,
			);

			let ok = 0;
			let failed = 0;
			for (let i = 0; i < chunks.length; i++) {
				const batch = chunks[i];
				const chunkNum = i + 1;
				this.logger.log(
					`[${runId}] TMS batch: chunk ${chunkNum}/${chunks.length} — POST ${batch.length} driver(s) to TMS batch endpoint…`,
				);
				try {
					await this.batchService.sendBatch(batch);
					ok++;
					this.logger.log(
						`[${runId}] TMS batch: chunk ${chunkNum}/${chunks.length} OK (${batch.length} driver(s))`,
					);
				} catch (e) {
					failed++;
					const msg = e instanceof Error ? e.message : String(e);
					this.logger.error(
						`[${runId}] TMS batch: chunk ${chunkNum}/${chunks.length} FAILED (${batch.length} drivers): ${msg}`,
					);
				}
			}

			this.logger.log(
				`[${runId}] TMS batch: run finished — ${items.length} drivers, ${chunks.length} chunk(s), ${ok} succeeded, ${failed} failed`,
			);
			return true;
		} finally {
			await this.prisma.$executeRawUnsafe(
				'SELECT pg_advisory_unlock($1::int, $2::int)',
				ADV_LOCK_KEY1,
				ADV_LOCK_KEY2,
			);
			this.logger.log(`[${runId}] TMS batch: lock released`);
		}
	}
}
