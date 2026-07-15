import { Controller, Post, Body, HttpCode, HttpStatus, Inject, Logger } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
} from '@nestjs/swagger';
import { ChatRoomsService, CreateLoadChatResult } from './chat-rooms.service';
import { CreateLoadChatDto } from './dto/create-load-chat.dto';
import { UpdateLoadChatDto } from './dto/update-load-chat.dto';
import { ChatGateway } from './chat.gateway';
import { MessagesService } from './messages.service';

@ApiTags('Load Chat')
@Controller('create_load_chat')
export class LoadChatController {
	private readonly logger = new Logger(LoadChatController.name);

	constructor(
		private readonly chatRoomsService: ChatRoomsService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
		private readonly messagesService: MessagesService,
	) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Create LOAD chat(s) — one per driver',
		description:
			'Creates a LOAD chat per driver in participants. Reuses an existing chat for the same load_id + driver. Non-driver participants are shared across chats. Title is appended with `(externalId FirstName LastName)`.',
	})
	@ApiResponse({
		status: 201,
		description: 'Load chat(s) created or reused successfully',
		schema: {
			example: {
				chats: [
					{
						id: 'chat_room_xyz',
						name: 'Load #12345 Discussion (ext_driver_1 John Doe)',
						type: 'LOAD',
						loadId: 'load_12345',
						company: 'Odysseia',
						avatar: null,
						isArchived: false,
						adminId: null,
						createdAt: '2025-10-19T18:00:00.000Z',
						updatedAt: '2025-10-19T18:00:00.000Z',
						participants: [],
					},
				],
			},
		},
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - driver not found, inactive, or missing',
	})
	async createLoadChat(@Body() createLoadChatDto: CreateLoadChatDto) {
		this.logger.log(
			`[create_load_chat] Incoming TMS request: ${JSON.stringify({
				load_id: createLoadChatDto.load_id,
				title: createLoadChatDto.title,
				company: createLoadChatDto.company,
				participants: createLoadChatDto.participants,
				dispatch_message: createLoadChatDto.dispatch_message?.trim()
					? '[present]'
					: undefined,
			})}`,
		);

		const results: CreateLoadChatResult[] =
			await this.chatRoomsService.createLoadChat(createLoadChatDto);

		this.logger.log(
			`[create_load_chat] Completed: count=${results.length}, kinds=${results
				.map((r) => r.kind)
				.join(',')}, loadId=${createLoadChatDto.load_id}, chatRoomIds=${results
				.map((r) => r.chatRoom?.id ?? 'n/a')
				.join(',')}`,
		);

		for (const result of results) {
			await this.applyCreateLoadChatSideEffects(
				result,
				createLoadChatDto.dispatch_message,
			);
		}

		const chats = results.map((r) => r.chatRoom);
		// Backward compatible: single-driver requests still get the chat room object.
		if (chats.length === 1) {
			return chats[0];
		}
		return { chats };
	}

	private async applyCreateLoadChatSideEffects(
		result: CreateLoadChatResult,
		dispatchMessage?: string,
	) {
		for (const deleted of result.hardDeletedChats) {
			for (const userId of deleted.notifyUserIds) {
				this.chatGateway.server
					.to(`user_${userId}`)
					.emit('chatRoomDeleted', {
						chatRoomId: deleted.chatRoomId,
						deletedBy: 'system',
					});
			}
		}

		if (result.kind === 'noop') {
			return;
		}

		if (result.kind === 'converted' && result.conversionParticipantEvents) {
			const { chatRoomId, newParticipants, addedUserIds, removedUserIds } =
				result.conversionParticipantEvents;

			if (addedUserIds.length > 0 && newParticipants.length > 0) {
				this.chatGateway.server
					.to(`chat_${chatRoomId}`)
					.emit('participantsAdded', {
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
				this.chatGateway.server
					.to(`chat_${chatRoomId}`)
					.emit('participantRemoved', {
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

			if (result.chatRoom?.participants?.length) {
				const updatedAt = new Date().toISOString();
				for (const participant of result.chatRoom.participants) {
					this.chatGateway.server
						.to(`user_${participant.userId}`)
						.emit('chatRoomUpdated', {
							chatRoomId: result.chatRoom.id,
							updatedChatRoom: result.chatRoom,
							updatedBy: 'system',
							updatedAt,
						});
				}
			}
		} else if (result.kind === 'created' && result.chatRoom?.participants?.length) {
			this.logger.log(
				`[create_load_chat] WebSocket chatRoomCreated emitted for ${result.chatRoom.participants.length} participant(s), chatRoomId=${result.chatRoom.id}`,
			);
			for (const participant of result.chatRoom.participants) {
				this.chatGateway.server
					.to(`user_${participant.userId}`)
					.emit('chatRoomCreated', result.chatRoom);
			}
		}

		await this.maybeCreateDispatchSystemMessage(result, dispatchMessage);
	}

	private async maybeCreateDispatchSystemMessage(
		result: CreateLoadChatResult,
		dispatchMessage?: string,
	) {
		const text = dispatchMessage?.trim();
		if (!text || result.kind === 'noop' || !result.chatRoom?.id) {
			return;
		}

		const participantUserIds =
			result.chatRoom.participants?.map(
				(participant: { userId: string }) => participant.userId,
			) ?? [];
		if (participantUserIds.length === 0) {
			return;
		}

		const message = await this.messagesService.createLoadDispatchSystemMessage(
			result.chatRoom.id,
			text,
		);
		if (!message) {
			return;
		}

		this.logger.log(
			`[create_load_chat] Dispatch system message created: chatRoomId=${result.chatRoom.id}, messageId=${message.id}`,
		);

		void this.chatGateway.broadcastMessage(
			result.chatRoom.id,
			message,
			participantUserIds,
		);
	}

	@Post('update')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'Ensure LOAD chats exist for each driver (TMS)',
		description:
			'Same as POST /update_load_chat: creates missing per-driver LOAD chats; existing load+driver chats are left untouched.',
	})
	@ApiResponse({ status: 200, description: 'LOAD chats ensured for requested drivers' })
	async updateLoadChat(@Body() dto: UpdateLoadChatDto) {
		const outcome = await this.chatRoomsService.updateLoadChatParticipants(dto);

		for (const result of outcome.results) {
			for (const deleted of result.hardDeletedChats) {
				for (const userId of deleted.notifyUserIds) {
					this.chatGateway.server.to(`user_${userId}`).emit('chatRoomDeleted', {
						chatRoomId: deleted.chatRoomId,
						deletedBy: 'system',
					});
				}
			}

			if (result.kind === 'noop' || !result.chatRoom) {
				continue;
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
						this.chatGateway.server
							.to(`user_${participant.userId}`)
							.emit('chatRoomUpdated', {
								chatRoomId: result.chatRoom.id,
								updatedChatRoom: result.chatRoom,
								updatedBy: 'system',
								updatedAt,
							});
					}
				}
			} else if (result.kind === 'created' && result.chatRoom.participants?.length) {
				for (const participant of result.chatRoom.participants) {
					this.chatGateway.server
						.to(`user_${participant.userId}`)
						.emit('chatRoomCreated', result.chatRoom);
				}
			}
		}

		return {
			updated: true,
			createdCount: outcome.created.length,
			existingCount: outcome.existing.length,
			createdChatRoomIds: outcome.created.map((r) => r.chatRoom?.id),
			existingChatRoomIds: outcome.existing.map((r) => r.chatRoom?.id),
			chats: outcome.chats,
		};
	}
}
