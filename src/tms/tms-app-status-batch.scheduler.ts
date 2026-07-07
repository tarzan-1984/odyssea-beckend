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
import { dedupeTmsBatchByDriverId } from './tms-batch-dedupe.util';

/** Separate advisory lock from TMS location batch job. */
const ADV_LOCK_KEY1 = 872_003;
const ADV_LOCK_KEY2 = 330_031;

/** Users requested batch size for app/status endpoint. */
const APP_STATUS_CHUNK_SIZE = 150;

/** Matches how `lastActiveApp` is written (`Date.UTC(NY_wall_clock_components)` → stored TIMESTAMP). */
function formatSqlTimestampFromLastActiveAppDate(
	d: Date | null | undefined,
): string {
	if (!d) return '';
	const ms = d.getTime();
	if (!Number.isFinite(ms)) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** `lastLocationUpdateAt` is already `YYYY-MM-DD HH:mm:ss` in DB — send trimmed or empty. */
function appUpdateStringFromDb(s: string | null | undefined): string {
	return s?.trim() ?? '';
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
			// Only DRIVER rows — TMS app status is driver-specific.
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

			const dedupeEntries: Parameters<
				typeof dedupeTmsBatchByDriverId<TmsBatchAppStatusItem>
			>[0] = [];
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
				const lastActiveMs = u.lastActiveApp?.getTime() ?? Number.NaN;
				const lastLocationMs = Date.parse(
					u.lastLocationUpdateAt?.trim() ?? '',
				);
				const freshnessMs = Number.isFinite(lastActiveMs)
					? lastActiveMs
					: Number.isFinite(lastLocationMs)
						? lastLocationMs
						: 0;
				dedupeEntries.push({
					driverId,
					item: {
						driver_id: driverId,
						app_online: formatSqlTimestampFromLastActiveAppDate(
							u.lastActiveApp ?? undefined,
						),
						app_update: appUpdateStringFromDb(u.lastLocationUpdateAt),
					},
					freshnessMs,
					externalId: ext,
				});
			}

			const {
				items,
				duplicateCount,
				duplicateExternalIds,
			} = dedupeTmsBatchByDriverId(dedupeEntries);
			if (duplicateCount > 0) {
				this.logger.warn(
					`[${runId}] TMS app status batch: ${duplicateCount} duplicate DRIVER row(s) with the same TMS externalId (${duplicateExternalIds.join(', ')}) — kept freshest row per driver_id`,
				);
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
