import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type UserDevicesUserIdBackfillOptions = {
	/** Max rows per request (clamped 1..200). Default 50. */
	batchSize?: number;
	/** Offset into ordered list (by id asc). Default 0. */
	skip?: number;
};

export type UserDevicesUserIdBackfillResult = {
	/** Rows with user_id IS NULL (not only this batch). */
	totalMatching: number;
	batchSize: number;
	skip: number;
	processedInBatch: number;
	updated: number;
	skippedNoMatch: number;
	unmatchedDevices: Array<{ id: string; userExternalId: string }>;
	hasMore: boolean;
	nextSkip: number | null;
};

const MIN_BATCH = 1;
const MAX_BATCH = 200;
const DEFAULT_BATCH = 50;
const MAX_UNMATCHED_IN_RESPONSE = 50;

@Injectable()
export class UserDevicesUserIdBackfillService {
	private readonly logger = new Logger(UserDevicesUserIdBackfillService.name);

	constructor(private readonly prisma: PrismaService) {}

	async backfillUserIdBatch(
		options?: UserDevicesUserIdBackfillOptions,
	): Promise<UserDevicesUserIdBackfillResult> {
		const requestedBatch = options?.batchSize ?? DEFAULT_BATCH;
		const batchSize = Math.min(
			MAX_BATCH,
			Math.max(MIN_BATCH, requestedBatch || DEFAULT_BATCH),
		);
		const skip = Math.max(0, options?.skip ?? 0);

		const where = { userId: null };
		const totalMatching = await this.prisma.userDevice.count({ where });

		const devices = await this.prisma.userDevice.findMany({
			where,
			select: { id: true, userExternalId: true },
			orderBy: { id: 'asc' },
			skip,
			take: batchSize,
		});

		if (devices.length === 0) {
			return {
				totalMatching,
				batchSize,
				skip,
				processedInBatch: 0,
				updated: 0,
				skippedNoMatch: 0,
				unmatchedDevices: [],
				hasMore: false,
				nextSkip: null,
			};
		}

		const ids = devices.map((d) => d.id);
		const updated = await this.prisma.$executeRaw`
			UPDATE "user_devices" ud
			SET "user_id" = sub.user_id
			FROM (
				SELECT DISTINCT ON (ud_inner.id)
					ud_inner.id AS device_id,
					u.id AS user_id
				FROM "user_devices" ud_inner
				INNER JOIN "users" u ON u."externalId" = ud_inner."userExternalId"
				WHERE ud_inner.id IN (${Prisma.join(ids)})
				ORDER BY
					ud_inner.id,
					CASE WHEN u.role = 'DRIVER' THEN 0 ELSE 1 END,
					u."createdAt" ASC
			) sub
			WHERE ud.id = sub.device_id
		`;

		const processedInBatch = devices.length;
		const skippedNoMatch = processedInBatch - Number(updated);
		const unmatchedDevices: Array<{ id: string; userExternalId: string }> =
			[];

		if (skippedNoMatch > 0) {
			const stillNull = await this.prisma.userDevice.findMany({
				where: { id: { in: ids }, userId: null },
				select: { id: true, userExternalId: true },
				take: MAX_UNMATCHED_IN_RESPONSE,
			});
			for (const row of stillNull) {
				unmatchedDevices.push({
					id: row.id,
					userExternalId: row.userExternalId,
				});
			}
		}

		const nextSkip = skip + processedInBatch;
		const hasMore = nextSkip < totalMatching;

		this.logger.log(
			`user_devices user_id backfill batch: skip=${skip}, processed=${processedInBatch}, updated=${updated}, skippedNoMatch=${skippedNoMatch}, totalMatching=${totalMatching}`,
		);

		return {
			totalMatching,
			batchSize,
			skip,
			processedInBatch,
			updated: Number(updated),
			skippedNoMatch,
			unmatchedDevices,
			hasMore,
			nextSkip: hasMore ? nextSkip : null,
		};
	}
}
