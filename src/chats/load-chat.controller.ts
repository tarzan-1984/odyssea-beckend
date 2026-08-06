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
import { TrackingTeamsService } from '../tracking/tracking-teams.service';
import { stripPerUserChatRoomFields } from './strip-per-user-chat-room-fields';

@ApiTags('Load Chat')
@Controller('create_load_chat')
export class LoadChatController {
	private readonly logger = new Logger(LoadChatController.name);

	constructor(
		private readonly chatRoomsService: ChatRoomsService,
		@Inject(ChatGateway) private readonly chatGateway: ChatGateway,
		private readonly messagesService: MessagesService,
		private readonly loadChatLogService: LoadChatLogService,
		private readonly trackingTeamsService: TrackingTeamsService,
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
				void this.invalidateTeamsCacheForResult(result);
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
				const safeRoom = stripPerUserChatRoomFields(
					result.chatRoom as Record<string, unknown>,
				);
				for (const participant of result.chatRoom.participants) {
					this.chatGateway.server
						.to(`user_${participant.userId}`)
						.emit('chatRoomUpdated', {
							chatRoomId: result.chatRoom.id,
							updatedChatRoom: safeRoom,
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

	private async invalidateTeamsCacheForResult(result: CreateLoadChatResult) {
		const userIds = new Set<string>();
		for (const deleted of result.hardDeletedChats) {
			for (const userId of deleted.notifyUserIds) {
				userIds.add(userId);
			}
		}
		const participants = result.chatRoom?.participants ?? [];
		for (const participant of participants) {
			if (participant?.userId) userIds.add(participant.userId);
		}
		const events = result.conversionParticipantEvents;
		if (events) {
			for (const userId of events.addedUserIds) userIds.add(userId);
			for (const userId of events.removedUserIds) userIds.add(userId);
		}
		if (userIds.size === 0) return;
		try {
			await this.trackingTeamsService.invalidateForUserIds([...userIds]);
		} catch (error) {
			this.logger.warn(
				`Failed to invalidate tracking teams cache: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
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
					void this.invalidateTeamsCacheForResult(result);
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
						const safeRoom = stripPerUserChatRoomFields(
							result.chatRoom as Record<string, unknown>,
						);
						for (const participant of result.chatRoom.participants) {
							this.chatGateway.server
								.to(`user_${participant.userId}`)
								.emit('chatRoomUpdated', {
									chatRoomId: result.chatRoom.id,
									updatedChatRoom: safeRoom,
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

				void this.invalidateTeamsCacheForResult(result);
			}

			const staffSyncUserIds = new Set<string>();
			for (const event of outcome.staffSyncEvents) {
				const { chatRoomId, chatRoom, newParticipants, addedUserIds, removedUserIds } =
					event;

				for (const userId of addedUserIds) staffSyncUserIds.add(userId);
				for (const userId of removedUserIds) staffSyncUserIds.add(userId);
				for (const participant of chatRoom?.participants ?? []) {
					if (participant?.userId) staffSyncUserIds.add(participant.userId);
				}

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
					const safeRoom = stripPerUserChatRoomFields(
						chatRoom as Record<string, unknown>,
					);
					for (const participant of chatRoom.participants) {
						this.chatGateway.server.to(`user_${participant.userId}`).emit('chatRoomUpdated', {
							chatRoomId,
							updatedChatRoom: safeRoom,
							updatedBy: 'system',
							updatedAt,
						});
					}
				}
			}
			if (staffSyncUserIds.size > 0) {
				void this.trackingTeamsService
					.invalidateForUserIds([...staffSyncUserIds])
					.catch((error) => {
						this.logger.warn(
							`Failed to invalidate tracking teams cache: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					});
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
