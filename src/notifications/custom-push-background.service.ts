import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { UserStatus } from '@prisma/client';

export type CustomPushBroadcastJob = {
	message: string;
	platform?: 'ios' | 'android';
};

const USER_BATCH_SIZE = 25;
const BATCH_DELAY_MS = 150;

/**
 * In-process background queue for admin broadcast push notifications.
 * Keeps POST /v1/notifications/push fast when many ACTIVE users are targeted.
 */
@Injectable()
export class CustomPushBackgroundService {
	private readonly logger = new Logger(CustomPushBackgroundService.name);
	private readonly pendingJobs: CustomPushBroadcastJob[] = [];
	private draining = false;

	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsService: NotificationsService,
	) {}

	async enqueueBroadcast(
		params: CustomPushBroadcastJob,
	): Promise<{ targeted: false; users: number; queued: true; platform?: 'ios' | 'android' }> {
		const message = (params.message ?? '').trim();
		if (!message) {
			return { targeted: false, users: 0, queued: true, platform: params.platform };
		}

		const users = await this.countTargetUsers(params.platform);

		this.pendingJobs.push({
			message,
			platform: params.platform,
		});

		void this.drainQueue().catch((error: Error) => {
			this.logger.error('Custom push broadcast queue drain failed:', error);
		});

		return {
			targeted: false,
			users,
			queued: true,
			platform: params.platform,
		};
	}

	private async countTargetUsers(platform?: 'ios' | 'android'): Promise<number> {
		return this.prisma.user.count({
			where: this.buildUserWhere(platform),
		});
	}

	private buildUserWhere(platform?: 'ios' | 'android') {
		return {
			status: UserStatus.ACTIVE,
			pushTokens: { some: {} },
			...(platform
				? {
						userDevices: {
							some: {
								platform: { equals: platform, mode: 'insensitive' as const },
							},
						},
					}
				: {}),
		};
	}

	private async drainQueue(): Promise<void> {
		if (this.draining) return;
		this.draining = true;

		try {
			while (this.pendingJobs.length > 0) {
				const job = this.pendingJobs.shift();
				if (!job) continue;

				try {
					await this.processJob(job);
				} catch (error) {
					this.logger.error('Custom push broadcast job failed:', error);
				}
			}
		} finally {
			this.draining = false;
			if (this.pendingJobs.length > 0) {
				void this.drainQueue().catch((error: Error) => {
					this.logger.error('Custom push broadcast queue re-drain failed:', error);
				});
			}
		}
	}

	private async processJob(job: CustomPushBroadcastJob): Promise<void> {
		const message = job.message.trim();
		if (!message) return;

		const startedAt = Date.now();
		const userIds = await this.fetchTargetUserIds(job.platform);

		this.logger.log(
			`Custom push broadcast started users=${userIds.length} platform=${job.platform ?? 'all'}`,
		);

		let sent = 0;
		let failed = 0;

		for (let i = 0; i < userIds.length; i += USER_BATCH_SIZE) {
			const batch = userIds.slice(i, i + USER_BATCH_SIZE);

			const results = await Promise.allSettled(
				batch.map((userId) =>
					this.notificationsService.sendAdminBroadcastPushToUser(userId, message),
				),
			);

			for (const result of results) {
				if (result.status === 'fulfilled') {
					sent += 1;
				} else {
					failed += 1;
					this.logger.warn(
						`Custom push broadcast user failed: ${(result.reason as Error)?.message ?? result.reason}`,
					);
				}
			}

			if (i + USER_BATCH_SIZE < userIds.length) {
				await this.delay(BATCH_DELAY_MS);
			}
		}

		this.logger.log(
			`Custom push broadcast finished users=${userIds.length} sent=${sent} failed=${failed} ms=${Date.now() - startedAt}`,
		);
	}

	private async fetchTargetUserIds(platform?: 'ios' | 'android'): Promise<string[]> {
		const users = await this.prisma.user.findMany({
			where: this.buildUserWhere(platform),
			select: { id: true },
		});

		return users.map((user) => user.id);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
