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
	 * either set isLoadArchived = true when there are messages, or delete the room
	 * when it has zero messages (no archiving value — only noise in DB/UI).
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
			_count: { messages: number };
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
					_count: { select: { messages: true } },
				},
			});
		} catch (error) {
			this.logger.error(
				'Failed to fetch delivered LOAD chats for delivered-load cleanup cron',
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
				if (chat._count.messages === 0) {
					await this.prisma.chatRoom.delete({ where: { id: chat.id } });

					const deletedPayload = {
						chatRoomId: chat.id,
						deletedBy: 'system',
					};
					for (const participant of chat.participants) {
						this.chatGateway.server
							.to(`user_${participant.userId}`)
							.emit('chatRoomDeleted', deletedPayload);
					}
					this.logger.log(
						`Deleted delivered LOAD chat with zero messages chatRoomId=${chat.id} loadId=${chat.loadId ?? 'n/a'}`,
					);
					continue;
				}

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
					`Delivered LOAD chat cleanup failed for chatRoomId=${chat.id} loadId=${chat.loadId ?? 'n/a'}`,
					error,
				);
			}
		}
	}
}
