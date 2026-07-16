import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
	ChatRoomsService,
	CreateLoadChatResult,
	LoadChatStaffSyncEvent,
} from './chat-rooms.service';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { ChatGateway } from './chat.gateway';

@ApiTags('Load Chat')
@Controller('update_load_chat')
export class UpdateLoadChatController {
	private readonly logger = new Logger(UpdateLoadChatController.name);

	constructor(
		private readonly chatRoomsService: ChatRoomsService,
		private readonly chatGateway: ChatGateway,
	) {}

	@Post()
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Ensure LOAD chats exist for each driver and sync non-driver participants (TMS)',
		description:
			'Same per-driver rules as create_load_chat: creates a LOAD chat for each driver that does not yet have one for this load_id. Then compares non-driver participants from the request with every LOAD chat for this load_id and adds/removes staff accordingly (drivers are never changed by this sync).',
	})
	@ApiResponse({ status: 200, description: 'LOAD chats ensured and non-driver participants synced' })
	async update(@Body() dto: UpdateLoadChatDto) {
		const outcome = await this.chatRoomsService.updateLoadChatParticipants(dto);

		for (const result of outcome.results) {
			this.emitSideEffects(result);
		}
		for (const event of outcome.staffSyncEvents) {
			this.emitStaffSyncSideEffects(event);
		}

		return {
			updated: true,
			createdCount: outcome.created.length,
			existingCount: outcome.existing.length,
			staffSyncedChatCount: outcome.staffSyncEvents.length,
			createdChatRoomIds: outcome.created.map((r) => r.chatRoom?.id),
			existingChatRoomIds: outcome.existing.map((r) => r.chatRoom?.id),
			staffSyncedChatRoomIds: outcome.staffSyncEvents.map((e) => e.chatRoomId),
			chats: outcome.chats,
		};
	}

	private emitStaffSyncSideEffects(event: LoadChatStaffSyncEvent) {
		const { chatRoomId, chatRoom, newParticipants, addedUserIds, removedUserIds } =
			event;

		if (addedUserIds.length > 0 && newParticipants.length > 0) {
			this.chatGateway.server.to(`chat_${chatRoomId}`).emit('participantsAdded', {
				chatRoomId,
				newParticipants,
				addedBy: 'system',
			});
			for (const userId of addedUserIds) {
				const socketId = this.chatGateway['userSockets']?.get?.(userId);
				if (socketId) {
					this.chatGateway.server
						.to(socketId)
						.emit('addedToChatRoom', { chatRoomId, addedBy: 'system' });
				}
			}
		}

		for (const removedId of removedUserIds) {
			this.chatGateway.server.to(`chat_${chatRoomId}`).emit('participantRemoved', {
				chatRoomId,
				removedUserId: removedId,
				removedBy: 'system',
			});
			const socketId = this.chatGateway['userSockets']?.get?.(removedId);
			if (socketId) {
				this.chatGateway.server
					.to(socketId)
					.emit('removedFromChatRoom', { chatRoomId, removedBy: 'system' });
			}
		}

		if (chatRoom?.participants?.length) {
			const updatedAt = new Date().toISOString();
			for (const participant of chatRoom.participants) {
				this.chatGateway.server.to(`user_${participant.userId}`).emit('chatRoomUpdated', {
					chatRoomId,
					updatedChatRoom: chatRoom,
					updatedBy: 'system',
					updatedAt,
				});
			}
		}
	}

	private emitSideEffects(result: CreateLoadChatResult) {
		for (const deleted of result.hardDeletedChats) {
			for (const userId of deleted.notifyUserIds) {
				this.chatGateway.server.to(`user_${userId}`).emit('chatRoomDeleted', {
					chatRoomId: deleted.chatRoomId,
					deletedBy: 'system',
				});
			}
		}

		if (result.kind === 'noop' || !result.chatRoom) {
			return;
		}

		if (result.kind === 'converted' && result.conversionParticipantEvents) {
			const { chatRoomId, newParticipants, addedUserIds, removedUserIds } =
				result.conversionParticipantEvents;

			if (addedUserIds.length > 0 && newParticipants.length > 0) {
				this.chatGateway.server.to(`chat_${chatRoomId}`).emit('participantsAdded', {
					chatRoomId,
					newParticipants,
					addedBy: 'system',
				});
				for (const userId of addedUserIds) {
					const socketId = this.chatGateway['userSockets']?.get?.(userId);
					if (socketId) {
						this.chatGateway.server
							.to(socketId)
							.emit('addedToChatRoom', { chatRoomId, addedBy: 'system' });
					}
				}
			}

			for (const removedId of removedUserIds) {
				this.chatGateway.server.to(`chat_${chatRoomId}`).emit('participantRemoved', {
					chatRoomId,
					removedUserId: removedId,
					removedBy: 'system',
				});
				const socketId = this.chatGateway['userSockets']?.get?.(removedId);
				if (socketId) {
					this.chatGateway.server
						.to(socketId)
						.emit('removedFromChatRoom', { chatRoomId, removedBy: 'system' });
				}
			}

			if (result.chatRoom.participants?.length) {
				const updatedAt = new Date().toISOString();
				for (const participant of result.chatRoom.participants) {
					this.chatGateway.server.to(`user_${participant.userId}`).emit('chatRoomUpdated', {
						chatRoomId: result.chatRoom.id,
						updatedChatRoom: result.chatRoom,
						updatedBy: 'system',
						updatedAt,
					});
				}
			}
			return;
		}

		if (result.kind === 'created' && result.chatRoom.participants?.length) {
			this.logger.log(
				`[update_load_chat] WebSocket chatRoomCreated for ${result.chatRoom.participants.length} participant(s), chatRoomId=${result.chatRoom.id}`,
			);
			for (const participant of result.chatRoom.participants) {
				this.chatGateway.server
					.to(`user_${participant.userId}`)
					.emit('chatRoomCreated', result.chatRoom);
			}
		}
	}
}
