import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus } from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AxiosError } from '../types/request.types';

export type BackfillDriverApplicationOptions = {
	/** Max drivers to process in this request (clamped 1..200). Default 50. */
	batchSize?: number;
	/** Offset into the ordered list (by lastActiveApp asc). Default 0. */
	skip?: number;
};

export type BackfillDriverApplicationResult = {
	/** Rows matching the backfill filter (not only this batch). */
	totalMatching: number;
	batchSize: number;
	skip: number;
	processedInBatch: number;
	sent: number;
	failed: number;
	failedDrivers: Array<{ id: string; externalId: string; email: string | null }>;
	hasMore: boolean;
	nextSkip: number | null;
};

const MIN_BACKFILL_BATCH = 1;
const MAX_BACKFILL_BATCH = 200;
const DEFAULT_BACKFILL_BATCH = 50;

const TMS_DRIVER_APPLICATION_ACTIVATE_URL =
	'https://www.endurance-tms.com/wp-json/tms/v1/driver/application/activate';

@Injectable()
export class TmsDriverApplicationService {
	private readonly logger = new Logger(TmsDriverApplicationService.name);

	constructor(
		private readonly configService: ConfigService,
		private readonly prisma: PrismaService,
	) {}

	/**
	 * Notifies TMS that the driver has activated the mobile app (user.status → ACTIVE).
	 * Best-effort: errors are logged, not thrown.
	 */
	async notifyDriverApplicationActivated(
		driverExternalId: string | null | undefined,
	): Promise<boolean> {
		const trimmed = driverExternalId?.trim();
		if (!trimmed) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: empty externalId',
			);
			return false;
		}

		const apiKey = this.configService.get<string>('externalApi.tmsApiKey');
		if (!apiKey) {
			this.logger.warn(
				'Skipping TMS driver/application/activate: TMS_API_KEY not set',
			);
			return false;
		}

		const driver_id = /^\d+$/.test(trimmed)
			? parseInt(trimmed, 10)
			: trimmed;

		try {
			await axios.post(
				TMS_DRIVER_APPLICATION_ACTIVATE_URL,
				{ driver_id },
				{
					headers: {
						'X-API-Key': apiKey,
						'Content-Type': 'application/json',
					},
					timeout: 15000,
				},
			);
			this.logger.log(
				`TMS driver/application/activate sent for driver_id=${String(driver_id)}`,
			);
			return true;
		} catch (error) {
			const ax = error as AxiosError;
			this.logger.error(
				`TMS driver/application/activate failed for driver_id=${String(driver_id)}: ${ax.message}`,
				ax.response?.data != null
					? JSON.stringify(ax.response.data)
					: undefined,
			);
			return false;
		}
	}

	async backfillActivatedDriversFromLastActiveApp(
		options?: BackfillDriverApplicationOptions,
	): Promise<BackfillDriverApplicationResult> {
		const requestedBatch =
			options?.batchSize ?? DEFAULT_BACKFILL_BATCH;
		const batchSize = Math.min(
			MAX_BACKFILL_BATCH,
			Math.max(MIN_BACKFILL_BATCH, requestedBatch || DEFAULT_BACKFILL_BATCH),
		);
		const skip = Math.max(0, options?.skip ?? 0);

		const where = {
			status: UserStatus.ACTIVE,
			role: UserRole.DRIVER,
			lastActiveApp: { not: null },
			externalId: { not: null },
		};

		const totalMatching = await this.prisma.user.count({ where });

		const drivers = await this.prisma.user.findMany({
			where,
			select: {
				id: true,
				email: true,
				externalId: true,
			},
			orderBy: { lastActiveApp: 'asc' },
			skip,
			take: batchSize,
		});

		let sent = 0;
		const failedDrivers: Array<{
			id: string;
			externalId: string;
			email: string | null;
		}> = [];

		let processedInBatch = 0;
		for (const driver of drivers) {
			const externalId = driver.externalId?.trim();
			if (!externalId) {
				continue;
			}

			processedInBatch++;
			const ok = await this.notifyDriverApplicationActivated(externalId);
			if (ok) {
				sent++;
			} else {
				failedDrivers.push({
					id: driver.id,
					externalId,
					email: driver.email ?? null,
				});
			}
		}

		const nextOffset = skip + drivers.length;
		const hasMore = nextOffset < totalMatching;

		return {
			totalMatching,
			batchSize,
			skip,
			processedInBatch,
			sent,
			failed: failedDrivers.length,
			failedDrivers,
			hasMore,
			nextSkip: hasMore ? nextOffset : null,
		};
	}
}
