import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Injectable()
export class DeliveredLoadChatCleanupScheduler {
	private readonly logger = new Logger(DeliveredLoadChatCleanupScheduler.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly appSettingsService: AppSettingsService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	/**
	 * Every 3 hours: for LOAD chats whose deliveryAt is past the configured delay,
	 * set isLoadArchived = true (chat rows and messages stay; no TMS/archive delete jobs).
	 */
	@Cron('0 */3 * * *')
	async markStaleDeliveredLoadChatsArchived() {
		let cutoff: Date;
		try {
			cutoff =
				await this.appSettingsService.getDeliveredLoadChatArchiveCutoffDate();
		} catch (error) {
			this.logger.error(
				'Failed to read delivered LOAD chat archive hours from app settings',
				error,
			);
			return;
		}

		let chats: {
			id: string;
			loadId: string | null;
			deliveryAt: Date | null;
			participants: { userId: string }[];
		}[];

		try {
			chats = await this.prisma.chatRoom.findMany({
				where: {
					type: 'LOAD',
					deliveryAt: { not: null, lte: cutoff },
					isLoadArchived: false,
				},
				select: {
					id: true,
					loadId: true,
					deliveryAt: true,
					participants: { select: { userId: true } },
				},
			});
		} catch (error) {
			this.logger.error(
				'Failed to fetch delivered LOAD chats for isLoadArchived update',
				error,
			);
			return;
		}

		if (chats.length === 0) {
			return;
		}

		this.logger.log(
			`Delivered LOAD chat archive flag: ${chats.length} chat(s) with deliveryAt <= ${cutoff.toISOString()}`,
		);

		const at = new Date().toISOString();

		for (const chat of chats) {
			try {
				await this.prisma.chatRoom.update({
					where: { id: chat.id },
					data: { isLoadArchived: true },
				});

				const payload = {
					chatRoomId: chat.id,
					updatedChatRoom: {
						id: chat.id,
						isLoadArchived: true,
					},
					updatedBy: 'system',
					updatedAt: at,
				};

				for (const participant of chat.participants) {
					this.chatGateway.server
						.to(`user_${participant.userId}`)
						.emit('chatRoomUpdated', payload);
				}
			} catch (error) {
				this.logger.error(
					`Delivered LOAD isLoadArchived update failed for chatRoomId=${chat.id} loadId=${chat.loadId ?? 'n/a'}`,
					error,
				);
			}
		}
	}
}
