import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatRoomsService } from '../chats/chat-rooms.service';
import { ChatGateway } from '../chats/chat.gateway';

export type OfferPostCreateJob = {
	offerId: number;
	creatorUserId: string;
	driverExternalIds: string[];
	pickUp: string;
	delivery: string;
	offerTitle: string;
};

/**
 * In-process background queue for offer post-create work (push notifications + OFFER chats).
 * Keeps POST /v1/offers fast when many drivers are selected.
 */
@Injectable()
export class OfferPostCreateBackgroundService {
	private readonly logger = new Logger(OfferPostCreateBackgroundService.name);
	private readonly pendingJobs: OfferPostCreateJob[] = [];
	private draining = false;

	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly chatRoomsService: ChatRoomsService,
		private readonly chatGateway: ChatGateway,
	) {}

	enqueue(job: OfferPostCreateJob): void {
		if (!job.driverExternalIds.length) return;

		this.pendingJobs.push(job);
		void this.drainQueue().catch((error: Error) => {
			this.logger.error('Offer post-create queue drain failed:', error);
		});
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
					this.logger.error(
						`Offer post-create job failed for offer ${job.offerId}:`,
						error,
					);
				}
			}
		} finally {
			this.draining = false;
			if (this.pendingJobs.length > 0) {
				void this.drainQueue().catch((error: Error) => {
					this.logger.error('Offer post-create queue re-drain failed:', error);
				});
			}
		}
	}

	private async processJob(job: OfferPostCreateJob): Promise<void> {
		const driverExternalIds = job.driverExternalIds
			.map((id) => String(id ?? '').trim())
			.filter(Boolean);
		if (driverExternalIds.length === 0) return;

		const startedAt = Date.now();
		this.logger.log(
			`Offer post-create started offerId=${job.offerId} drivers=${driverExternalIds.length}`,
		);

		const assignedUsers = await this.prisma.user.findMany({
			where: { externalId: { in: driverExternalIds } },
			select: { id: true },
		});

		await Promise.all(
			assignedUsers.map((user) =>
				this.notificationsService
					.createOfferAddedNotification({
						userId: user.id,
						offerId: job.offerId,
						offerTitle: job.offerTitle,
					})
					.catch((error) => {
						this.logger.warn(
							`Offer post-create notification failed userId=${user.id} offerId=${job.offerId}: ${(error as Error).message}`,
						);
					}),
			),
		);

		const createdChats =
			await this.chatRoomsService.createOfferChatsForNewOffer(
				job.offerId,
				job.creatorUserId,
				driverExternalIds,
				job.pickUp,
				job.delivery,
			);

		for (const { chatRoom, participantIds } of createdChats) {
			this.chatGateway.notifyChatRoomCreated(chatRoom, participantIds);
		}

		this.logger.log(
			`Offer post-create finished offerId=${job.offerId} drivers=${driverExternalIds.length} chats=${createdChats.length} ms=${Date.now() - startedAt}`,
		);
	}
}
