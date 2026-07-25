import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingTransferDto } from './dto/tracking-transfer.dto';
import { ChatGateway } from '../chats/chat.gateway';
import { LoadChatLogService } from '../chats/load-chat-log.service';
import {
	newParticipantJoinedAt,
	parseInstantToNyNaiveDate,
} from '../common/utils/ny-wall-clock';
import { userWhereEmployeeByExternalId } from '../users/user-external-id-lookup.util';

type TransferOutcome = {
	ok: boolean;
	affectedLoadIds: string[];
	affectedChatRoomIds: string[];
	memberships: Array<{
		dispatcher_id: number;
		dispatcherUserId: string | null;
		chatRoomsMatched: number;
		trackingRemoved: number;
		trackingAdded: number;
		skipped: string | null;
	}>;
};

@Injectable()
export class TrackingTransferService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatGateway: ChatGateway,
		private readonly loadChatLogService: LoadChatLogService,
	) {}

	async transfer(dto: TrackingTransferDto): Promise<TransferOutcome> {
		const logAction = String(dto.action ?? '').trim() || 'save_manage_teams';
		const joinedAt = dto.ts
			? parseInstantToNyNaiveDate(dto.ts)
			: newParticipantJoinedAt();

		const affectedLoadIds = new Set<string>();
		const affectedChatRoomIds = new Set<string>();
		/** chatRoomId → removed internal user ids */
		const removedByRoom = new Map<string, Set<string>>();
		/** chatRoomId → added internal user ids */
		const addedByRoom = new Map<string, Set<string>>();

		const membershipResults: TransferOutcome['memberships'] = [];

		try {
			for (const membership of dto.memberships ?? []) {
				const dispatcherExternalId = String(membership.dispatcher_id).trim();
				const trackingExternalIds = Array.from(
					new Set(
						(membership.trackings ?? [])
							.map((n) => String(n).trim())
							.filter(Boolean),
					),
				);
				const excludeLoadIds = new Set(
					(membership.exclude_loads ?? [])
						.map((n) => String(n).trim())
						.filter(Boolean),
				);

				const dispatcher = await this.prisma.user.findFirst({
					where: userWhereEmployeeByExternalId(dispatcherExternalId),
					select: { id: true },
				});

				if (!dispatcher) {
					membershipResults.push({
						dispatcher_id: membership.dispatcher_id,
						dispatcherUserId: null,
						chatRoomsMatched: 0,
						trackingRemoved: 0,
						trackingAdded: 0,
						skipped: `dispatcher externalId=${dispatcherExternalId} not found (non-driver)`,
					});
					continue;
				}

				const trackingUsers = trackingExternalIds.length
					? await this.prisma.user.findMany({
							where: {
								OR: trackingExternalIds.map((externalId) =>
									userWhereEmployeeByExternalId(externalId),
								),
							},
							select: { id: true, externalId: true },
						})
					: [];

				// Prefer one user per externalId (non-driver already filtered by where).
				const trackingUserByExternal = new Map<string, string>();
				for (const u of trackingUsers) {
					const key = String(u.externalId ?? '').trim();
					if (key && !trackingUserByExternal.has(key)) {
						trackingUserByExternal.set(key, u.id);
					}
				}
				const replacementUserIds = Array.from(
					new Set(
						trackingExternalIds
							.map((ext) => trackingUserByExternal.get(ext))
							.filter((id): id is string => Boolean(id)),
					),
				);

				const rooms = await this.prisma.chatRoom.findMany({
					where: {
						type: 'LOAD',
						isLoadArchived: false,
						participants: {
							some: { userId: dispatcher.id },
						},
					},
					select: { id: true, loadId: true },
				});

				const targetRooms = rooms.filter((room) => {
					const loadId = String(room.loadId ?? '').trim();
					if (!loadId) return true;
					return !excludeLoadIds.has(loadId);
				});

				if (targetRooms.length === 0) {
					membershipResults.push({
						dispatcher_id: membership.dispatcher_id,
						dispatcherUserId: dispatcher.id,
						chatRoomsMatched: 0,
						trackingRemoved: 0,
						trackingAdded: 0,
						skipped: null,
					});
					continue;
				}

				const chatRoomIds = targetRooms.map((r) => r.id);
				const replacementSet = new Set(replacementUserIds);

				const trackingParticipants =
					await this.prisma.chatRoomParticipant.findMany({
						where: {
							chatRoomId: { in: chatRoomIds },
							user: { role: UserRole.TRACKING },
						},
						select: { id: true, chatRoomId: true, userId: true },
					});

				const existingReplacementRows =
					replacementUserIds.length > 0
						? await this.prisma.chatRoomParticipant.findMany({
								where: {
									chatRoomId: { in: chatRoomIds },
									userId: { in: replacementUserIds },
								},
								select: { chatRoomId: true, userId: true },
							})
						: [];
				const existingReplacementKeys = new Set(
					existingReplacementRows.map((p) => `${p.chatRoomId}:${p.userId}`),
				);

				const toRemove = trackingParticipants.filter(
					(p) => !replacementSet.has(p.userId),
				);
				const toCreate: Array<{
					chatRoomId: string;
					userId: string;
					joinedAt: Date;
				}> = [];

				for (const room of targetRooms) {
					for (const userId of replacementUserIds) {
						const key = `${room.id}:${userId}`;
						if (!existingReplacementKeys.has(key)) {
							toCreate.push({ chatRoomId: room.id, userId, joinedAt });
						}
					}
				}

				await this.prisma.$transaction(async (tx) => {
					if (toRemove.length > 0) {
						await tx.chatRoomParticipant.deleteMany({
							where: { id: { in: toRemove.map((p) => p.id) } },
						});
					}
					if (toCreate.length > 0) {
						await tx.chatRoomParticipant.createMany({
							data: toCreate,
							skipDuplicates: true,
						});
					}
				});

				for (const room of targetRooms) {
					affectedChatRoomIds.add(room.id);
					const loadId = String(room.loadId ?? '').trim();
					if (loadId) affectedLoadIds.add(loadId);
				}

				for (const p of toRemove) {
					if (!removedByRoom.has(p.chatRoomId)) {
						removedByRoom.set(p.chatRoomId, new Set());
					}
					removedByRoom.get(p.chatRoomId)!.add(p.userId);
				}
				for (const row of toCreate) {
					if (!addedByRoom.has(row.chatRoomId)) {
						addedByRoom.set(row.chatRoomId, new Set());
					}
					addedByRoom.get(row.chatRoomId)!.add(row.userId);
				}

				membershipResults.push({
					dispatcher_id: membership.dispatcher_id,
					dispatcherUserId: dispatcher.id,
					chatRoomsMatched: targetRooms.length,
					trackingRemoved: toRemove.length,
					trackingAdded: toCreate.length,
					skipped: null,
				});
			}

			const outcome: TransferOutcome = {
				ok: true,
				affectedLoadIds: Array.from(affectedLoadIds),
				affectedChatRoomIds: Array.from(affectedChatRoomIds),
				memberships: membershipResults,
			};

			await this.loadChatLogService.recordSuccess(
				logAction,
				'tms',
				dto,
				outcome,
			);

			await this.emitWebsocketUpdates(removedByRoom, addedByRoom);

			return outcome;
		} catch (error) {
			await this.loadChatLogService.recordFailure(
				logAction,
				'tms',
				dto,
				error,
			);
			throw error;
		}
	}

	private async emitWebsocketUpdates(
		removedByRoom: Map<string, Set<string>>,
		addedByRoom: Map<string, Set<string>>,
	): Promise<void> {
		const chatRoomIds = Array.from(
			new Set([...removedByRoom.keys(), ...addedByRoom.keys()]),
		);

		for (const chatRoomId of chatRoomIds) {
			try {
				const chatRoom = await this.prisma.chatRoom.findUnique({
					where: { id: chatRoomId },
					include: {
						participants: {
							include: {
								user: {
									select: {
										id: true,
										firstName: true,
										lastName: true,
										role: true,
										profilePhoto: true,
										userColor: true,
									},
								},
							},
						},
					},
				});

				if (!chatRoom) continue;

				const updatedAt = new Date().toISOString();
				for (const participant of chatRoom.participants) {
					void this.chatGateway.server
						.to(`user_${participant.userId}`)
						.emit('chatRoomUpdated', {
							chatRoomId,
							updatedChatRoom: chatRoom,
							updatedBy: 'system',
							updatedAt,
						});
				}

				const removedUserIds = Array.from(removedByRoom.get(chatRoomId) ?? []);
				for (const removedUserId of removedUserIds) {
					void this.chatGateway.server
						.to(`chat_${chatRoomId}`)
						.emit('participantRemoved', {
							chatRoomId,
							removedUserId,
							removedBy: 'system',
						});
					void this.chatGateway.server
						.to(`user_${removedUserId}`)
						.emit('removedFromChatRoom', {
							chatRoomId,
							removedBy: 'system',
						});
				}

				const addedUserIds = Array.from(addedByRoom.get(chatRoomId) ?? []);
				if (addedUserIds.length > 0) {
					const newParticipants = chatRoom.participants.filter((p) =>
						addedUserIds.includes(p.userId),
					);
					if (newParticipants.length > 0) {
						void this.chatGateway.server
							.to(`chat_${chatRoomId}`)
							.emit('participantsAdded', {
								chatRoomId,
								newParticipants,
								addedBy: 'system',
							});
					}
					for (const addedUserId of addedUserIds) {
						void this.chatGateway.server
							.to(`user_${addedUserId}`)
							.emit('addedToChatRoom', { chatRoomId, addedBy: 'system' });
					}
				}
			} catch {
				// Do not block the transfer on WebSocket notification issues
			}
		}
	}
}
