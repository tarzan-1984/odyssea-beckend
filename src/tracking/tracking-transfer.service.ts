import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingTransferDto } from './dto/tracking-transfer.dto';
import { ChatGateway } from '../chats/chat.gateway';

@Injectable()
export class TrackingTransferService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly chatGateway: ChatGateway,
	) {}

	async transfer(dto: TrackingTransferDto): Promise<{
		chatRoomsMatched: number;
		oldRemovedFrom: number;
		newAddedTo: number;
	}> {
		const oldExternalId = String(dto.old_tracking).trim();
		const newExternalId = String(dto.new_tracking).trim();

		const [oldUser, newUser] = await Promise.all([
			this.prisma.user.findUnique({ where: { externalId: oldExternalId } }),
			this.prisma.user.findUnique({ where: { externalId: newExternalId } }),
		]);

		if (!oldUser) {
			throw new NotFoundException(
				`User with externalId=${oldExternalId} not found`,
			);
		}
		if (!newUser) {
			throw new NotFoundException(
				`User with externalId=${newExternalId} not found`,
			);
		}

		const loadIds = Array.from(
			new Set(dto.id_loads.map((n) => String(n).trim()).filter(Boolean)),
		);

		if (loadIds.length === 0) {
			return { chatRoomsMatched: 0, oldRemovedFrom: 0, newAddedTo: 0 };
		}

		const rooms = await this.prisma.chatRoom.findMany({
			where: { type: 'LOAD', loadId: { in: loadIds } },
			select: { id: true, company: true, loadId: true },
		});
		const chatRoomIds = rooms.map((r) => r.id);

		if (chatRoomIds.length === 0) {
			return { chatRoomsMatched: 0, oldRemovedFrom: 0, newAddedTo: 0 };
		}

		const expectedCompany = String(dto.project ?? '').trim().toLowerCase();
		if (!expectedCompany) {
			throw new BadRequestException('Missing required field: project');
		}

		const mismatch = rooms.find((r) => {
			const c = String(r.company ?? '').trim().toLowerCase();
			return c !== expectedCompany;
		});
		if (mismatch) {
			throw new BadRequestException(
				`Company mismatch for loadId=${mismatch.loadId ?? 'unknown'} (chatRoomId=${mismatch.id}): expected=${dto.project}, got=${mismatch.company ?? ''}`,
			);
		}

		const joinedAt = dto.ts ? new Date(dto.ts) : new Date();

		const oldParticipantRows = await this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId: { in: chatRoomIds }, userId: oldUser.id },
			select: { chatRoomId: true },
		});
		const oldRoomsSet = new Set(oldParticipantRows.map((r) => r.chatRoomId));

		const newParticipantRows = await this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId: { in: chatRoomIds }, userId: newUser.id },
			select: { chatRoomId: true },
		});
		const newRoomsSet = new Set(newParticipantRows.map((r) => r.chatRoomId));

		const removedFromRoomIds = Array.from(oldRoomsSet);
		const addedToRoomIds = chatRoomIds.filter((id) => !newRoomsSet.has(id));

		const outcome = await this.prisma.$transaction(async (tx) => {
			const removed = await tx.chatRoomParticipant.deleteMany({
				where: {
					chatRoomId: { in: chatRoomIds },
					userId: oldUser.id,
				},
			});

			const existingNew = await tx.chatRoomParticipant.findMany({
				where: {
					chatRoomId: { in: chatRoomIds },
					userId: newUser.id,
				},
				select: { chatRoomId: true },
			});
			const existingNewSet = new Set(existingNew.map((p) => p.chatRoomId));

			const toCreate = chatRoomIds
				.filter((id) => !existingNewSet.has(id))
				.map((chatRoomId) => ({
					chatRoomId,
					userId: newUser.id,
					joinedAt,
				}));

			const created =
				toCreate.length > 0
					? await tx.chatRoomParticipant.createMany({
							data: toCreate,
							skipDuplicates: true,
						})
					: { count: 0 };

			return {
				chatRoomsMatched: chatRoomIds.length,
				oldRemovedFrom: removed.count,
				newAddedTo: created.count,
			};
		});

		// WebSocket: notify all affected rooms so UIs update in real time.
		// - chatRoomUpdated for everyone (refresh list state)
		// - participantRemoved / removedFromChatRoom for the removed user
		// - participantsAdded + addedToChatRoom for the added user
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

				if (removedFromRoomIds.includes(chatRoomId)) {
					void this.chatGateway.server
						.to(`chat_${chatRoomId}`)
						.emit('participantRemoved', {
							chatRoomId,
							removedUserId: oldUser.id,
							removedBy: 'system',
						});
					void this.chatGateway.server
						.to(`user_${oldUser.id}`)
						.emit('removedFromChatRoom', {
							chatRoomId,
							removedBy: 'system',
						});
				}

				if (addedToRoomIds.includes(chatRoomId)) {
					const newParticipant = chatRoom.participants.find(
						(p) => p.userId === newUser.id,
					);
					if (newParticipant) {
						void this.chatGateway.server
							.to(`chat_${chatRoomId}`)
							.emit('participantsAdded', {
								chatRoomId,
								newParticipants: [newParticipant],
								addedBy: 'system',
							});
					}
					void this.chatGateway.server
						.to(`user_${newUser.id}`)
						.emit('addedToChatRoom', { chatRoomId, addedBy: 'system' });
				}
			} catch {
				// Do not block the transfer on WebSocket notification issues
			}
		}

		return outcome;
	}
}

