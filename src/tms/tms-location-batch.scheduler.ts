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

/**
 * TMS batch: log full payload row + DB snapshot for this externalId (remove or change after testing).
 */
const TMS_BATCH_DEBUG_EXTERNAL_ID = '2465';

function isTmsBatchDebugDriver(externalId: string | null | undefined): boolean {
	return externalId?.trim() === TMS_BATCH_DEBUG_EXTERNAL_ID;
}

@Injectable()
export class TmsLocationBatchScheduler {
	private readonly logger = new Logger(TmsLocationBatchScheduler.name);
	/** Last time a full batch run completed (ms). */
	private lastRunAtMs = 0;
	/** Throttle "cooldown" logs so operators see the scheduler is alive between runs. */
	private lastCooldownLogAtMs = 0;
	/** Only send driver locations updated within this window. */
	private readonly maxLastLocationAgeMs = 24 * 60 * 60 * 1000;

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
		if (extApi?.skipTmsDriverLocationSync) {
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
			const cutoffMs = Date.now() - this.maxLastLocationAgeMs;
			const driversFromDb = await this.prisma.user.findMany({
				where: {
					role: UserRole.DRIVER,
					status: UserStatus.ACTIVE,
					isAutoupdate: true,
					// Treat null as false; skip only explicit deactivated accounts.
					deactivateAccount: { not: true },
					externalId: { not: null },
					latitude: { not: null },
					longitude: { not: null },
					lastLocationUpdateAt: { not: null },
				},
				select: {
					externalId: true,
					latitude: true,
					longitude: true,
					location: true,
					city: true,
					zip: true,
					driverStatus: true,
					statusDate: true,
					lastLocationUpdateAt: true,
				},
				orderBy: { id: 'asc' },
			});

			const globalRow = await this.appSettingsService.getGlobal();
			const isTestEnv = globalRow.locationEnvironmentMode === 'test';
			const testExtId = globalRow.locationTestDriverExternalId.trim();

			// Live: all eligible drivers. Test: only the configured TMS externalId (never other drivers).
			const drivers = !isTestEnv
				? driversFromDb
				: !testExtId
					? []
					: driversFromDb.filter(
							(u) => u.externalId?.trim() === testExtId,
						);

			if (isTestEnv && !testExtId) {
				this.logger.warn(
					`[${runId}] TMS batch: test mode but locationTestDriverExternalId is empty — not sending any driver to TMS`,
				);
			} else if (isTestEnv) {
				this.logger.log(
					`[${runId}] TMS batch: test mode — only externalId=${testExtId} (${drivers.length} row(s), ${driversFromDb.length} before filter)`,
				);
			}

			this.logger.log(
				`[${runId}] TMS batch: ${drivers.length} driver row(s) from DB (ACTIVE, isAutoupdate, not deactivated, has coords, has externalId, has lastLocationUpdateAt)`,
			);

			const items: TmsBatchLocationItem[] = [];
			let emptyDriverStatusInBatch = 0;
			for (const u of drivers) {
				const debugDriver = isTmsBatchDebugDriver(u.externalId);
				const lastUpdateRaw = u.lastLocationUpdateAt?.trim() ?? '';
				if (!lastUpdateRaw) {
					if (debugDriver) {
						this.logger.warn(
							`[${runId}] TMS batch DEBUG externalId=${TMS_BATCH_DEBUG_EXTERNAL_ID}: skipped — empty lastLocationUpdateAt`,
						);
					}
					continue;
				}
				// `lastLocationUpdateAt` is stored as a client-local ISO-like string (no timezone).
				// We accept only values parseable by Date.parse; otherwise skip to avoid sending stale/invalid data.
				const parsedMs = Date.parse(lastUpdateRaw);
				if (!Number.isFinite(parsedMs) || parsedMs < cutoffMs) {
					if (debugDriver) {
						this.logger.warn(
							`[${runId}] TMS batch DEBUG externalId=${TMS_BATCH_DEBUG_EXTERNAL_ID}: skipped — lastLocationUpdateAt not parseable or older than 24h raw=${JSON.stringify(lastUpdateRaw)} parsedMs=${parsedMs} cutoffMs=${cutoffMs}`,
						);
					}
					continue;
				}

				const ext = u.externalId?.trim();
				if (!ext) continue;
				const driverId = parseTmsDriverIdFromExternalId(ext);
				if (driverId === null) {
					if (debugDriver) {
						this.logger.warn(
							`[${runId}] TMS batch DEBUG externalId=${TMS_BATCH_DEBUG_EXTERNAL_ID}: skipped — non-numeric externalId after trim`,
						);
					}
					this.logger.warn(
						`[${runId}] TMS batch: skip driver externalId not numeric: ${ext}`,
					);
					continue;
				}
				const lat = u.latitude as number;
				const lng = u.longitude as number;
				const locationTrimmed = u.location?.trim() ?? '';
				const statusRaw = u.statusDate?.trim() ?? '';
				const driverStatusTrimmed = u.driverStatus?.trim() ?? '';
				if (!driverStatusTrimmed) {
					emptyDriverStatusInBatch++;
				}
				const item: TmsBatchLocationItem = {
					driver_id: driverId,
					latitude: String(lat),
					longitude: String(lng),
					current_city: u.city?.trim() ?? '',
					current_location: locationTrimmed
						? normalizeTmsCurrentLocation(u.location)
						: '',
					current_zipcode: u.zip?.trim() ?? '',
					driver_status: driverStatusTrimmed,
					status_date: statusRaw
						? formatTmsStatusDate(u.statusDate)
						: '',
					country: '',
					current_country: '',
					notes: '',
				};
				if (debugDriver) {
					this.logger.log(
						`[${runId}] TMS batch DEBUG externalId=${TMS_BATCH_DEBUG_EXTERNAL_ID}: included in batch — DB snapshot driverStatus=${JSON.stringify(u.driverStatus)} statusDate=${JSON.stringify(u.statusDate)} lastLocationUpdateAt=${JSON.stringify(u.lastLocationUpdateAt)} city=${JSON.stringify(u.city)} zip=${JSON.stringify(u.zip)} location=${JSON.stringify(u.location)} lat=${lat} lng=${lng} → TMS item ${JSON.stringify(item)}`,
					);
				}
				items.push(item);
			}

			const debugInDriversList = drivers.some((d) =>
				isTmsBatchDebugDriver(d.externalId),
			);
			const debugInBatch = items.some(
				(it) => it.driver_id === Number.parseInt(TMS_BATCH_DEBUG_EXTERNAL_ID, 10),
			);
			if (debugInDriversList && !debugInBatch) {
				this.logger.warn(
					`[${runId}] TMS batch DEBUG externalId=${TMS_BATCH_DEBUG_EXTERNAL_ID}: present in cron driver list after env filter but no row added to batch (see skip logs above this run if any)`,
				);
			}

			if (emptyDriverStatusInBatch > 0) {
				this.logger.warn(
					`[${runId}] TMS batch: ${emptyDriverStatusInBatch} of ${items.length} payload row(s) have empty driver_status (users.driverStatus null/blank in DB). TMS may apply a default such as "available".`,
				);
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
