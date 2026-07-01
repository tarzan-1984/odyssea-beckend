import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';

@Injectable()
export class LoadChatTmsSyncService {
	private readonly logger = new Logger(LoadChatTmsSyncService.name);

	constructor(
		private readonly prisma: PrismaService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
	) {}

	/**
	 * Clears deliveryAt and isLoadArchived on LOAD chats for a load and notifies participants.
	 */
	async reactivateLoadChats(loadId: string): Promise<number> {
		const rooms = await this.prisma.chatRoom.findMany({
			where: { loadId, type: 'LOAD' },
			select: {
				id: true,
				deliveryAt: true,
				isLoadArchived: true,
				participants: { select: { userId: true } },
			},
		});

		if (rooms.length === 0) {
			return 0;
		}

		const needsUpdate = rooms.some(
			(room) => room.deliveryAt != null || room.isLoadArchived,
		);
		if (!needsUpdate) {
			return 0;
		}

		await this.prisma.chatRoom.updateMany({
			where: { loadId, type: 'LOAD' },
			data: { deliveryAt: null, isLoadArchived: false },
		});

		const at = new Date().toISOString();
		for (const room of rooms) {
			const payload = {
				chatRoomId: room.id,
				updatedChatRoom: {
					id: room.id,
					isLoadArchived: false,
					deliveryAt: null,
				},
				updatedBy: 'system',
				updatedAt: at,
			};

			for (const participant of room.participants) {
				this.chatGateway.server
					.to(`user_${participant.userId}`)
					.emit('chatRoomUpdated', payload);
			}
		}

		this.logger.log(
			`Reactivated ${rooms.length} LOAD chat(s) for loadId=${loadId}`,
		);

		return rooms.length;
	}
}
