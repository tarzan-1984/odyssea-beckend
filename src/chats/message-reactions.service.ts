import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MessageReactionUser = {
	id: string;
	firstName: string;
	lastName: string;
	avatar?: string | null;
	userColor?: string | null;
	role?: string;
};

export type MessageReactionGroup = {
	emoji: string;
	users: MessageReactionUser[];
	hasCurrentUser: boolean;
};

type ReactionRow = {
	emoji: string;
	user: {
		id: string;
		firstName: string;
		lastName: string;
		profilePhoto: string | null;
		userColor: string | null;
		role: string;
	};
};

@Injectable()
export class MessageReactionsService {
	constructor(private readonly prisma: PrismaService) {}

	normalizeEmoji(emoji: string): string {
		const trimmed = emoji.trim();
		if (!trimmed || trimmed.length > 32) {
			throw new BadRequestException('Invalid emoji');
		}
		return trimmed;
	}

	groupReactions(
		rows: ReactionRow[],
		currentUserId: string,
	): MessageReactionGroup[] {
		const byEmoji = new Map<string, MessageReactionGroup>();

		for (const row of rows) {
			const existing = byEmoji.get(row.emoji);
			const user: MessageReactionUser = {
				id: row.user.id,
				firstName: row.user.firstName,
				lastName: row.user.lastName,
				avatar: row.user.profilePhoto,
				userColor: row.user.userColor,
				role: row.user.role,
			};

			if (existing) {
				existing.users.push(user);
				if (row.user.id === currentUserId) {
					existing.hasCurrentUser = true;
				}
			} else {
				byEmoji.set(row.emoji, {
					emoji: row.emoji,
					users: [user],
					hasCurrentUser: row.user.id === currentUserId,
				});
			}
		}

		return Array.from(byEmoji.values());
	}

	async getGroupedByMessageIds(
		messageIds: string[],
		currentUserId: string,
	): Promise<Map<string, MessageReactionGroup[]>> {
		const result = new Map<string, MessageReactionGroup[]>();
		if (messageIds.length === 0) {
			return result;
		}

		const rows = await this.prisma.messageReaction.findMany({
			where: { messageId: { in: messageIds } },
			orderBy: { createdAt: 'asc' },
			select: {
				messageId: true,
				emoji: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
					},
				},
			},
		});

		const byMessage = new Map<string, ReactionRow[]>();
		for (const row of rows) {
			const list = byMessage.get(row.messageId) ?? [];
			list.push({ emoji: row.emoji, user: row.user });
			byMessage.set(row.messageId, list);
		}

		for (const messageId of messageIds) {
			const grouped = this.groupReactions(
				byMessage.get(messageId) ?? [],
				currentUserId,
			);
			result.set(messageId, grouped);
		}

		return result;
	}

	async attachReactionsToMessages<T extends { id: string }>(
		messages: T[],
		currentUserId: string,
	): Promise<(T & { reactions: MessageReactionGroup[] })[]> {
		const map = await this.getGroupedByMessageIds(
			messages.map((m) => m.id),
			currentUserId,
		);
		return messages.map((message) => ({
			...message,
			reactions: map.get(message.id) ?? [],
		}));
	}

	private async assertMessageAccess(
		messageId: string,
		userId: string,
	): Promise<{ id: string; chatRoomId: string; senderId: string }> {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: { id: true, chatRoomId: true, senderId: true },
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId: message.chatRoomId,
					userId,
				},
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		return message;
	}

	/** Reactions only on incoming messages (not on your own). */
	private assertNotOwnMessage(
		message: { senderId: string },
		userId: string,
	): void {
		if (message.senderId === userId) {
			throw new BadRequestException(
				'You can only react to messages from other participants',
			);
		}
	}

	async getReactionsForMessage(
		messageId: string,
		userId: string,
	): Promise<MessageReactionGroup[]> {
		await this.assertMessageAccess(messageId, userId);

		const rows = await this.prisma.messageReaction.findMany({
			where: { messageId },
			orderBy: { createdAt: 'asc' },
			select: {
				emoji: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
					},
				},
			},
		});

		return this.groupReactions(rows, userId);
	}

	async setReaction(
		userId: string,
		messageId: string,
		emoji: string,
	): Promise<{
		messageId: string;
		chatRoomId: string;
		messageSenderId: string;
		actorUserId: string;
		actorFirstName: string;
		actorLastName: string;
		emoji: string;
		reactions: MessageReactionGroup[];
	}> {
		const normalized = this.normalizeEmoji(emoji);
		const message = await this.assertMessageAccess(messageId, userId);
		this.assertNotOwnMessage(message, userId);

		await this.prisma.messageReaction.upsert({
			where: {
				messageId_userId: {
					messageId,
					userId,
				},
			},
			create: {
				messageId,
				userId,
				emoji: normalized,
			},
			update: {
				emoji: normalized,
			},
		});

		const reactions = await this.getReactionsForMessage(messageId, userId);

		const actor = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { firstName: true, lastName: true },
		});

		return {
			messageId,
			chatRoomId: message.chatRoomId,
			messageSenderId: message.senderId,
			actorUserId: userId,
			actorFirstName: actor?.firstName ?? '',
			actorLastName: actor?.lastName ?? '',
			emoji: normalized,
			reactions,
		};
	}

	async removeReaction(
		userId: string,
		messageId: string,
	): Promise<{
		messageId: string;
		chatRoomId: string;
		messageSenderId: string;
		reactions: MessageReactionGroup[];
	}> {
		const message = await this.assertMessageAccess(messageId, userId);
		this.assertNotOwnMessage(message, userId);

		await this.prisma.messageReaction.deleteMany({
			where: { messageId, userId },
		});

		const reactions = await this.getReactionsForMessage(messageId, userId);

		return {
			messageId,
			chatRoomId: message.chatRoomId,
			messageSenderId: message.senderId,
			reactions,
		};
	}
}
