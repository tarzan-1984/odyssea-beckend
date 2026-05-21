import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { ExternalApiConfig } from '../config/env.config';
import {
	TmsBatchAppStatusItem,
	TmsDriverAppStatusBatchService,
} from './tms-driver-app-status-batch.service';
import { parseTmsDriverIdFromExternalId } from './tms-driver-location-batch.service';

/** Separate advisory lock from TMS location batch job. */
const ADV_LOCK_KEY1 = 872_003;
const ADV_LOCK_KEY2 = 330_031;

/** Users requested batch size for app/status endpoint. */
const APP_STATUS_CHUNK_SIZE = 150;

/** DB `last_active_app` → TMS `app_online` (Unix seconds). */
function unixSecondsFromDate(d: Date | null | undefined): number {
	if (!d) return 0;
	const ms = d.getTime();
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/** DB `lastLocationUpdateAt` string → TMS `app_update` (Unix seconds). */
function unixSecondsFromLocationString(s: string | null | undefined): number {
	const raw = s?.trim();
	if (!raw) return 0;
	const ms = Date.parse(raw);
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

@Injectable()
export class TmsAppStatusBatchScheduler {
	private readonly logger = new Logger(TmsAppStatusBatchScheduler.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly configService: ConfigService,
		private readonly appSettingsService: AppSettingsService,
		private readonly batchService: TmsDriverAppStatusBatchService,
	) {}

	/** Every hour at minute 0 (cron: second minute hour …). */
	@Cron('0 0 * * * *', { name: 'tms-driver-app-status-batch-hourly' })
	async onHourly(): Promise<void> {
		const extApi = this.configService.get<ExternalApiConfig>('externalApi');
		if (!extApi?.tmsAppStatusBatchCronEnabled) {
			return;
		}
		if (!this.configService.get<string>('externalApi.tmsApiKey')) {
			return;
		}

		await this.runBatch();
	}

	private async runBatch(): Promise<void> {
		const runId = `tms-app-status-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

		const rows = await this.prisma.$queryRawUnsafe<{ got: boolean }[]>(
			'SELECT pg_try_advisory_lock($1::int, $2::int) AS got',
			ADV_LOCK_KEY1,
			ADV_LOCK_KEY2,
		);
		const gotLock = rows[0]?.got === true;
		if (!gotLock) {
			this.logger.warn(
				`[${runId}] TMS app status batch: skipped — another instance holds the lock`,
			);
			return;
		}

		this.logger.log(`[${runId}] TMS app status batch: lock acquired`);

		try {
			const driversFromDb = await this.prisma.user.findMany({
				where: {
					role: UserRole.DRIVER,
					externalId: { not: null },
				},
				select: {
					externalId: true,
					lastActiveApp: true,
					lastLocationUpdateAt: true,
				},
				orderBy: { id: 'asc' },
			});

			const globalRow = await this.appSettingsService.getGlobal();
			const isTestEnv = globalRow.locationEnvironmentMode === 'test';
			const testExtId = globalRow.locationTestDriverExternalId.trim();

			const drivers = !isTestEnv
				? driversFromDb
				: !testExtId
					? []
					: driversFromDb.filter(
							(u) => u.externalId?.trim() === testExtId,
						);

			if (isTestEnv && !testExtId) {
				this.logger.warn(
					`[${runId}] TMS app status batch: test mode but locationTestDriverExternalId is empty — not sending`,
				);
			} else if (isTestEnv) {
				this.logger.log(
					`[${runId}] TMS app status batch: test mode — only externalId=${testExtId} (${drivers.length} row(s))`,
				);
			}

			const items: TmsBatchAppStatusItem[] = [];
			for (const u of drivers) {
				const ext = u.externalId?.trim();
				if (!ext) continue;
				const driverId = parseTmsDriverIdFromExternalId(ext);
				if (driverId === null) {
					this.logger.warn(
						`[${runId}] TMS app status batch: skip non-numeric externalId=${JSON.stringify(ext)}`,
					);
					continue;
				}
				items.push({
					driver_id: driverId,
					app_online: unixSecondsFromDate(u.lastActiveApp ?? undefined),
					app_update: unixSecondsFromLocationString(u.lastLocationUpdateAt),
				});
			}

			this.logger.log(
				`[${runId}] TMS app status batch: ${items.length} item(s) (${driversFromDb.length} DRIVER rows from DB before test filter)`,
			);

			if (items.length === 0) {
				return;
			}

			const chunks: TmsBatchAppStatusItem[][] = [];
			for (let i = 0; i < items.length; i += APP_STATUS_CHUNK_SIZE) {
				chunks.push(items.slice(i, i + APP_STATUS_CHUNK_SIZE));
			}

			let ok = 0;
			let failed = 0;
			for (let i = 0; i < chunks.length; i++) {
				const batch = chunks[i];
				const chunkNum = i + 1;
				this.logger.log(
					`[${runId}] TMS app status batch: chunk ${chunkNum}/${chunks.length} — POST ${batch.length} driver(s)…`,
				);
				try {
					await this.batchService.sendBatch(batch);
					ok++;
					this.logger.log(
						`[${runId}] TMS app status batch: chunk ${chunkNum}/${chunks.length} OK`,
					);
				} catch (e) {
					failed++;
					const msg = e instanceof Error ? e.message : String(e);
					this.logger.error(
						`[${runId}] TMS app status batch: chunk ${chunkNum}/${chunks.length} FAILED: ${msg}`,
					);
				}
			}

			this.logger.log(
				`[${runId}] TMS app status batch: finished — ${chunks.length} chunk(s), ${ok} OK, ${failed} failed`,
			);
		} finally {
			await this.prisma.$executeRawUnsafe(
				'SELECT pg_advisory_unlock($1::int, $2::int)',
				ADV_LOCK_KEY1,
				ADV_LOCK_KEY2,
			);
			this.logger.log(`[${runId}] TMS app status batch: lock released`);
		}
	}
}
