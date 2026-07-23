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
import { LoadChatLogService } from './load-chat-log.service';

@ApiTags('Load Chat')
@Controller('create_load_chat')
export class LoadChatController {
	private readonly logger = new Logger(LoadChatController.name);

	constructor(
		private readonly chatRoomsService: ChatRoomsService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
		private readonly messagesService: MessagesService,
		private readonly loadChatLogService: LoadChatLogService,
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
		description:
			'Bad request - missing driver participant role in request (unknown users are skipped with warnings)',
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

		try {
			const { results, warnings } =
				await this.chatRoomsService.createLoadChat(createLoadChatDto);

			this.logger.log(
				`[create_load_chat] Completed: count=${results.length}, kinds=${results
					.map((r) => r.kind)
					.join(',')}, warnings=${warnings.length}, loadId=${createLoadChatDto.load_id}, chatRoomIds=${results
					.map((r) => r.chatRoom?.id ?? 'n/a')
					.join(',')}`,
			);

			for (const result of results) {
				await this.applyCreateLoadChatSideEffects(
					result,
					createLoadChatDto.dispatch_message,
				);
			}

			await this.loadChatLogService.recordSuccess(
				'create',
				'tms',
				createLoadChatDto,
				{
					ok: true,
					...(warnings.length > 0 ? { level: 'warning', warnings } : {}),
					kinds: results.map((r) => r.kind),
					chatRoomIds: results.map((r) => r.chatRoom?.id ?? null),
				},
				createLoadChatDto.load_id,
			);

			const chats = results.map((r) => r.chatRoom);
			// Backward compatible: single-driver requests still get the chat room object.
			if (chats.length === 1) {
				return chats[0];
			}
			return { chats, ...(warnings.length > 0 ? { warnings } : {}) };
		} catch (error) {
			await this.loadChatLogService.recordFailure(
				'create',
				'tms',
				createLoadChatDto,
				error,
				createLoadChatDto.load_id,
			);
			throw error;
		}
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
		summary: 'Ensure LOAD chats exist for each driver and sync non-driver participants (TMS)',
		description:
			'Same as POST /update_load_chat: creates missing per-driver LOAD chats, then syncs non-driver participants across all LOAD chats for this load_id.',
	})
	@ApiResponse({ status: 200, description: 'LOAD chats ensured and non-driver participants synced' })
	async updateLoadChat(@Body() dto: UpdateLoadChatDto) {
		try {
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

			for (const event of outcome.staffSyncEvents) {
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

			const response = {
				updated: true,
				createdCount: outcome.created.length,
				existingCount: outcome.existing.length,
				staffSyncedChatCount: outcome.staffSyncEvents.length,
				createdChatRoomIds: outcome.created.map((r) => r.chatRoom?.id),
				existingChatRoomIds: outcome.existing.map((r) => r.chatRoom?.id),
				staffSyncedChatRoomIds: outcome.staffSyncEvents.map((e) => e.chatRoomId),
				chats: outcome.chats,
			};

			await this.loadChatLogService.recordSuccess('update', 'tms', dto, {
				ok: true,
				...(outcome.warnings.length > 0
					? { level: 'warning', warnings: outcome.warnings }
					: {}),
				...response,
				chats: undefined,
				chatRoomIds: outcome.chats.map((c) => c?.id ?? null),
			}, dto.load_id);

			return {
				...response,
				...(outcome.warnings.length > 0
					? { warnings: outcome.warnings }
					: {}),
			};
		} catch (error) {
			await this.loadChatLogService.recordFailure('update', 'tms', dto, error, dto.load_id);
			throw error;
		}
	}
}
