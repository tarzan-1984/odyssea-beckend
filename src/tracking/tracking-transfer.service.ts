import { Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
	TrackingTransferDto,
	TrackingTransferMembershipDto,
} from './dto/tracking-transfer.dto';
import { ChatGateway } from '../chats/chat.gateway';
import { LoadChatLogService } from '../chats/load-chat-log.service';
import {
	newParticipantJoinedAt,
	parseInstantToNyNaiveDate,
} from '../common/utils/ny-wall-clock';
import {
	resolveUserRoleFromParticipantRole,
	userWhereEmployeeByExternalId,
} from '../users/user-external-id-lookup.util';

/** TMS membership keys whose non-empty arrays trigger role replacement. */
const ROLE_TRANSFER_FIELD_KEYS = [
	'tracking',
	'morning_tracking',
	'nightshift_tracking',
	'tracking-tl-daytime',
	'tracking-tl-nightshift',
	'tracking-tl-morningshift',
] as const;

type RoleTransferFieldKey = (typeof ROLE_TRANSFER_FIELD_KEYS)[number];

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
				const excludeLoadIds = new Set(
					(membership.exclude_loads ?? [])
						.map((n) => String(n).trim())
						.filter(Boolean),
				);

				const roleReplacements = this.collectRoleReplacements(membership);

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

				if (roleReplacements.length === 0) {
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
				let totalRemoved = 0;
				let totalAdded = 0;

				for (const { role, externalIds } of roleReplacements) {
					const result = await this.replaceRoleInRooms({
						chatRoomIds,
						targetRooms,
						role,
						externalIds,
						joinedAt,
						removedByRoom,
						addedByRoom,
					});
					totalRemoved += result.removed;
					totalAdded += result.added;
				}

				for (const room of targetRooms) {
					affectedChatRoomIds.add(room.id);
					const loadId = String(room.loadId ?? '').trim();
					if (loadId) affectedLoadIds.add(loadId);
				}

				membershipResults.push({
					dispatcher_id: membership.dispatcher_id,
					dispatcherUserId: dispatcher.id,
					chatRoomsMatched: targetRooms.length,
					trackingRemoved: totalRemoved,
					trackingAdded: totalAdded,
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

	/**
	 * Collect non-empty role → externalIds replacements from membership.
	 * Field key is the TMS role name (e.g. morning_tracking, tracking-tl-daytime).
	 */
	private collectRoleReplacements(
		membership: TrackingTransferMembershipDto,
	): Array<{ role: UserRole; externalIds: string[] }> {
		const out: Array<{ role: UserRole; externalIds: string[] }> = [];
		const raw = membership as TrackingTransferMembershipDto &
			Record<string, number[] | undefined>;

		for (const fieldKey of ROLE_TRANSFER_FIELD_KEYS) {
			const role = resolveUserRoleFromParticipantRole(fieldKey);
			if (!role) continue;

			const sourceIds =
				fieldKey === 'tracking'
					? (raw.tracking ?? raw.trackings ?? [])
					: (raw[fieldKey as RoleTransferFieldKey] ?? []);

			const externalIds = Array.from(
				new Set(
					(sourceIds ?? [])
						.map((n) => String(n).trim())
						.filter(Boolean),
				),
			);

			// Empty / missing array → do not touch this role in chats
			if (externalIds.length === 0) continue;

			out.push({ role, externalIds });
		}

		return out;
	}

	private async replaceRoleInRooms(params: {
		chatRoomIds: string[];
		targetRooms: Array<{ id: string; loadId: string | null }>;
		role: UserRole;
		externalIds: string[];
		joinedAt: Date;
		removedByRoom: Map<string, Set<string>>;
		addedByRoom: Map<string, Set<string>>;
	}): Promise<{ removed: number; added: number }> {
		const {
			chatRoomIds,
			targetRooms,
			role,
			externalIds,
			joinedAt,
			removedByRoom,
			addedByRoom,
		} = params;

		const users = await this.prisma.user.findMany({
			where: {
				OR: externalIds.map((externalId) =>
					userWhereEmployeeByExternalId(externalId),
				),
			},
			select: { id: true, externalId: true },
		});

		const userByExternal = new Map<string, string>();
		for (const u of users) {
			const key = String(u.externalId ?? '').trim();
			if (key && !userByExternal.has(key)) {
				userByExternal.set(key, u.id);
			}
		}
		const replacementUserIds = Array.from(
			new Set(
				externalIds
					.map((ext) => userByExternal.get(ext))
					.filter((id): id is string => Boolean(id)),
			),
		);
		const replacementSet = new Set(replacementUserIds);

		const roleParticipants = await this.prisma.chatRoomParticipant.findMany({
			where: {
				chatRoomId: { in: chatRoomIds },
				user: { role },
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

		const toRemove = roleParticipants.filter(
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

		return { removed: toRemove.length, added: toCreate.length };
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
