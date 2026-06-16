import {
	Injectable,
	NotFoundException,
	BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';
import { FcmPushService } from '../notifications/fcm-push.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { stripMarkdown } from './utils/strip-markdown.util';
import { Prisma, UserRole } from '@prisma/client';
import { MessageReactionsService } from './message-reactions.service';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';
import { ThumbnailService } from '../storage/thumbnail.service';
import { HeicAttachmentService } from '../storage/heic-attachment.service';

/** Only drivers are restricted to messages after they joined; other roles see full history. */
function shouldCutOffMessagesAtJoinedAt(_role: UserRole | null | undefined): boolean {
	// TEMP: join-date history cutoff disabled until timezone/join rules are stable
	return false;
}

/**
 * joinedAt is stored as naive NY wall-clock (same as message.createdAt).
 * Legacy rows written as UTC before this change may still need migration.
 */
function joinedAtCutoffForDriverMessages(joinedAt: Date): Date {
	return joinedAt;
}

@Injectable()
export class MessagesService {
	private readonly messageWithUsersInclude = {
		sender: {
			select: {
				id: true,
				firstName: true,
				lastName: true,
				profilePhoto: true,
				userColor: true,
				role: true,
				externalId: true,
				phone: true,
			},
		},
		receiver: {
			select: {
				id: true,
				firstName: true,
				lastName: true,
				profilePhoto: true,
				userColor: true,
				role: true,
				externalId: true,
				phone: true,
			},
		},
	} as const;

	constructor(
		private prisma: PrismaService,
		private fcmPushService: FcmPushService,
		private expoPushService: ExpoPushService,
		private messageReactionsService: MessageReactionsService,
		private thumbnailService: ThumbnailService,
		private heicAttachmentService: HeicAttachmentService,
	) {}

	/**
	 * Send a message to a chat room
	 * This method handles text messages and file attachments
	 */
	async sendMessage(sendMessageDto: SendMessageDto, senderId: string) {
		const {
			chatRoomId,
			content,
			fileUrl,
			fileName,
			fileSize,
			replyData,
			attachments,
		} = sendMessageDto;

		const trimmedContent = content?.trim() ?? '';
		const attachmentList =
			Array.isArray(attachments) && attachments.length > 0 ? attachments : null;

		let effectiveFileUrl = fileUrl ?? null;
		let effectiveFileName = fileName ?? null;
		let effectiveFileSize: number | null = fileSize ?? null;

		if (attachmentList) {
			for (const a of attachmentList) {
				if (!a.fileUrl?.trim() || !a.fileName?.trim()) {
					throw new BadRequestException(
						'Each attachment must include fileUrl and fileName',
					);
				}
				// Pipe is the multi-file delimiter in DB columns; reject if present in a single segment
				if (a.fileUrl.includes('|') || a.fileName.includes('|')) {
					throw new BadRequestException(
						'fileUrl and fileName must not contain "|" (reserved as multi-file separator)',
					);
				}
			}
			if (attachmentList.length < 2) {
				throw new BadRequestException(
					'attachments array requires at least 2 items; use fileUrl for a single file',
				);
			}
			// Store multiple files in one row: pipe-delimited (legacy single-file rows unchanged)
			effectiveFileUrl = attachmentList.map((a) => a.fileUrl.trim()).join('|');
			effectiveFileName = attachmentList.map((a) => a.fileName.trim()).join('|');
			effectiveFileSize = attachmentList[0].fileSize ?? null;
		}

		const hasBody =
			trimmedContent.length > 0 ||
			!!effectiveFileUrl ||
			(attachmentList && attachmentList.length > 0);

		if (!hasBody) {
			throw new BadRequestException(
				'Message must have non-empty content or at least one attachment',
			);
		}

		// Verify sender is participant in the chat room
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId: senderId,
				},
			},
		});

		if (!participant) {
			throw new BadRequestException(
				'You are not a participant in this chat room',
			);
		}

		const normalizedAttachments =
			await this.heicAttachmentService.normalizeMessageAttachments({
				fileUrl: effectiveFileUrl,
				fileName: effectiveFileName,
				fileSize: effectiveFileSize,
				attachmentList,
			});
		effectiveFileUrl = normalizedAttachments.fileUrl;
		effectiveFileName = normalizedAttachments.fileName;
		effectiveFileSize = normalizedAttachments.fileSize;
		const normalizedAttachmentList = normalizedAttachments.attachmentList;

		// Get all participants to determine receivers
		const participants = await this.prisma.chatRoomParticipant.findMany({
			where: { chatRoomId },
			select: { userId: true },
		});

		const createdAt = nowInNewYorkAsNaiveDate();

		const message = await this.prisma.$transaction(async (tx) => {
			const created = await tx.message.create({
				data: {
					chatRoomId,
					senderId,
					createdAt,
					content,
					fileUrl: effectiveFileUrl,
					fileName: effectiveFileName,
					fileSize: effectiveFileSize,
					attachments: undefined,
					replyData,
					receiverId:
						participants.length === 2
							? participants.find((p) => p.userId !== senderId)?.userId
							: null,
					isRead: false,
					readBy: [senderId],
				},
				include: {
					sender: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
							userColor: true,
							role: true,
							externalId: true,
							phone: true,
						},
					},
					receiver: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
							userColor: true,
							role: true,
							externalId: true,
							phone: true,
						},
					},
				},
			});

			await tx.chatRoom.update({
				where: { id: chatRoomId },
				data: { updatedAt: createdAt },
			});

			await this.incrementUnreadCountForOtherParticipants(
				chatRoomId,
				senderId,
				tx,
			);

			return created;
		});

		// Transform profilePhoto to avatar for frontend compatibility
		const transformedMessage = {
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
			// Add isRead field for WebSocket compatibility (always false for new messages)
			isRead: message.isRead,
		};

		// Fire-and-forget push notifications to other participants
		this.sendPushToParticipants(transformedMessage).catch(() => {});

		// Pre-generate chat image thumbnails in object storage (direct CDN URLs in UI)
		this.thumbnailService
			.ensureThumbnailsForMessage(
				effectiveFileUrl,
				effectiveFileName,
				normalizedAttachmentList,
			)
			.catch((error) => {
				console.error('[MessagesService] Thumbnail generation failed:', error);
			});

		const [withReactions] =
			await this.messageReactionsService.attachReactionsToMessages(
				[transformedMessage],
				senderId,
			);

		return withReactions;
	}

	/**
	 * Get chat room avatar URL
	 * Uses the same logic as frontend: for DIRECT chats use other participant's avatar,
	 * for GROUP/LOAD chats use chat avatar if available
	 */
	private async getChatRoomAvatar(
		chatRoomId: string,
		senderId: string,
	): Promise<string | null> {
		try {
			const chatRoom = await this.prisma.chatRoom.findUnique({
				where: { id: chatRoomId },
				include: {
					participants: {
						include: {
							user: {
								select: {
									id: true,
									profilePhoto: true,
									userColor: true,
								},
							},
						},
					},
				},
			});

			if (!chatRoom) {
				return null;
			}

			// For DIRECT and OFFER chats, use the other participant's avatar
			if (
				(chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') &&
				chatRoom.participants.length === 2
			) {
				const otherParticipant = chatRoom.participants.find(
					(p) => p.userId !== senderId,
				);
				if (otherParticipant?.user?.profilePhoto) {
					return otherParticipant.user.profilePhoto;
				}
				return null;
			}

			// For GROUP/LOAD chats, use chat avatar if available
			if (chatRoom.avatar) {
				return chatRoom.avatar;
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Send FCM push notifications to all participants, excluding sender.
	 * Non-blocking; errors ignored.
	 */
	private async sendPushToParticipants(message: any): Promise<void> {
		try {
			// Get all participant ids with mute status and exclude sender and muted users
			const participants = await this.prisma.chatRoomParticipant.findMany(
				{
					where: { chatRoomId: message.chatRoomId },
					select: { userId: true, mute: true },
				},
			);
			const receiverIds = participants
				.filter((p) => p.userId !== message.senderId && !p.mute)
				.map((p) => p.userId);
			if (receiverIds.length === 0) return;

			// Get chat room info to determine notification title
			const chatRoom = await this.prisma.chatRoom.findUnique({
				where: { id: message.chatRoomId },
				select: { type: true, name: true },
			});

			// Get receiver users info (role and driverStatus) for filtering
			const receiverUsers = await this.prisma.user.findMany({
				where: { id: { in: receiverIds } },
				select: {
					id: true,
					role: true,
					driverStatus: true,
					notificationsEnabled: true,
				},
			});

			// Get sender info (role) for filtering expired_documents drivers
			const senderUser = await this.prisma.user.findUnique({
				where: { id: message.senderId },
				select: { role: true },
			});

			// Filter receivers based on driver status rules
			const allowedReceiverIds = receiverUsers
				.filter((receiver) => {
					if (receiver.notificationsEnabled === false) {
						return false;
					}

					// Block push only for admin-blocked accounts (not driver "Out of service" / banned)
					if (
						receiver.role === UserRole.DRIVER &&
						receiver.driverStatus === 'blocked'
					) {
						return false;
					}

					// Filter push notifications for drivers with 'expired_documents' status
					if (
						receiver.role === UserRole.DRIVER &&
						receiver.driverStatus === 'expired_documents'
					) {
						// Block all non-DIRECT and non-OFFER chats
						if (chatRoom?.type !== 'DIRECT' && chatRoom?.type !== 'OFFER') {
							return false;
						}

						// For DIRECT and OFFER chats, only allow if sender role is in allowed list
						const allowedRolesForExpiredDocuments = [
							UserRole.RECRUITER,
							UserRole.RECRUITER_TL,
							UserRole.HR_MANAGER,
							UserRole.ADMINISTRATOR,
							UserRole.EXPEDITE_MANAGER,
						];

						const senderRole = senderUser?.role;
						if (
							!senderRole ||
							!allowedRolesForExpiredDocuments.some(
								(role) => role === senderRole,
							)
						) {
							return false;
						}
					}

					return true;
				})
				.map((receiver) => receiver.id);

			if (allowedReceiverIds.length === 0) return;

			// Fetch device tokens (FCM device tokens, not Expo tokens) only for allowed receivers
			const tokens = await this.prisma.pushToken.findMany({
				where: { userId: { in: allowedReceiverIds } },
				select: { token: true },
			});
			if (tokens.length === 0) return;

			// Determine notification title based on chat type
			let notificationTitle: string;
			if (chatRoom?.type === 'DIRECT' || chatRoom?.type === 'OFFER') {
				// For DIRECT and OFFER chats, show sender's name
				const senderName =
					[
						message.sender?.firstName || '',
						message.sender?.lastName || '',
					]
						.join(' ')
						.trim() || 'New message';
				notificationTitle = senderName;
			} else {
				// For GROUP and LOAD chats, show chat room name
				notificationTitle = chatRoom?.name || 'Group Chat';
			}

			const pipeUrlCount =
				message.fileUrl && message.fileName
					? (() => {
							const u = message.fileUrl.split('|');
							const n = message.fileName.split('|');
							return u.length >= 2 && u.length === n.length ? u.length : 0;
						})()
					: 0;

			const rawContent =
				message.content && String(message.content).trim()
					? stripMarkdown(String(message.content))
					: '';
			const body =
				rawContent ||
				(pipeUrlCount > 0
					? `Sent ${pipeUrlCount} files`
					: message.fileName
						? `Sent a file: ${message.fileName}`
						: 'New message');

			// Get chat room avatar
			const chatAvatar = await this.getChatRoomAvatar(
				message.chatRoomId,
				message.senderId,
			);

			// Prepare full message data for cache update in mobile app
			// FCM requires all data values to be strings, so we need to serialize objects
			// This allows mobile app to update cache even when app is closed
			const messageData: Record<string, string> = {
				chatRoomId: message.chatRoomId,
				messageId: message.id,
				senderId: message.senderId,
				receiverId: message.receiverId || '',
				content: message.content || '',
				fileUrl: message.fileUrl || '',
				fileName: message.fileName || '',
				fileSize: message.fileSize?.toString() || '0',
				isRead: message.isRead ? 'true' : 'false',
				readBy: JSON.stringify(
					Array.isArray(message.readBy) ? message.readBy : [],
				),
				createdAt: message.createdAt.toISOString(),
				// Serialize sender object (always present)
				sender: JSON.stringify({
					id: message.sender.id,
					firstName: message.sender.firstName || '',
					lastName: message.sender.lastName || '',
					avatar:
						message.sender.avatar ||
						message.sender.profilePhoto ||
						'',
					role: message.sender.role || '',
					externalId: message.sender.externalId ?? '',
					phone: message.sender.phone ?? '',
				}),
				// Serialize receiver object if exists
				receiver: message.receiver
					? JSON.stringify({
							id: message.receiver.id,
							firstName: message.receiver.firstName || '',
							lastName: message.receiver.lastName || '',
							avatar:
								message.receiver.avatar ||
								message.receiver.profilePhoto ||
								'',
							role: message.receiver.role || '',
							externalId: message.receiver.externalId ?? '',
							phone: message.receiver.phone ?? '',
						})
					: '',
				// Serialize replyData if exists (stored as JSON in DB)
				replyData: message.replyData
					? JSON.stringify(message.replyData)
					: '',
				// Flag to indicate this is a new message (for unreadCount increment)
				isNewMessage: 'true',
				// Include avatar URL for notification display
				...(chatAvatar ? { avatarUrl: chatAvatar } : {}),
			};

			// Extract device tokens
			const allTokens = tokens.map((t) => t.token).filter(Boolean);
			
			// Separate FCM tokens (Android) from Expo Push Tokens (iOS)
			// Expo Push Token starts with "ExponentPushToken[...]"
			const fcmTokens: string[] = [];
			const expoPushTokens: string[] = [];
			
			for (const token of allTokens) {
				if (token.startsWith('ExponentPushToken[')) {
					expoPushTokens.push(token);
				} else {
					fcmTokens.push(token);
				}
			}

			// Send FCM push notifications for Android devices
			if (fcmTokens.length > 0) {
				const fcmOptions = {
					title: notificationTitle,
					body,
					imageUrl: chatAvatar || undefined, // Avatar URL for notification icon (large icon for Android, image for iOS)
					data: messageData,
				};
				await this.fcmPushService.sendToTokens(fcmTokens, fcmOptions);
			}

			// Send Expo Push notifications for iOS devices
			if (expoPushTokens.length > 0) {
				const expoMessages = expoPushTokens.map((token) => ({
					to: token,
					title: notificationTitle,
					body,
					data: messageData,
					sound: 'livechat.wav',
					priority: 'high' as const,
					...(chatAvatar ? { largeIcon: chatAvatar } : {}),
				}));
				await this.expoPushService.send(expoMessages);
			}
		} catch (error) {
			// Log error but don't throw (non-blocking)
			console.error('Failed to send FCM push notifications:', error);
		}
	}

	/**
	 * Get messages for a specific chat room.
	 * - Default mode (no afterCreatedAt): paginated history (most recent messages first, then older ones for infinite scroll)
	 * - Smart sync mode (afterCreatedAt provided): return messages created *after* the given timestamp,
	 *   used by clients to fetch only new messages since the last known message.
	 * For drivers, filters messages to those created after they joined the chat room.
	 * Other roles see the full room history regardless of joinedAt.
	 */
	async getChatRoomMessages(
		chatRoomId: string,
		userId: string,
		page: number = 1,
		limit: number = 50,
		afterCreatedAt?: string,
	) {
		// Verify user is participant and load role for history cutoff rules
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			include: {
				user: { select: { role: true } },
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: null;

		// Base filter: full history for non-drivers; drivers only from joinedAt
		let messageFilter: any = { chatRoomId };
		if (joinedAtCutoff) {
			messageFilter.createdAt = { gte: joinedAtCutoff };
		}

		// If afterCreatedAt is provided, switch to "smart sync" mode:
		// fetch only messages created strictly after the given timestamp.
		if (afterCreatedAt) {
			const afterDate = new Date(afterCreatedAt);
			if (!Number.isNaN(afterDate.getTime())) {
				const minDate = joinedAtCutoff
					? afterDate > joinedAtCutoff
						? afterDate
						: joinedAtCutoff
					: afterDate;
				messageFilter = {
					...messageFilter,
					createdAt: {
						gt: minDate,
					},
				};
			}
		}

		let messages;
		let total = 0;
		let pages = 1;
		let hasMore = false;

		if (afterCreatedAt) {
			// Smart sync: fetch only new messages after the given timestamp.
			messages = await this.prisma.message.findMany({
				where: messageFilter,
				orderBy: { createdAt: 'asc' },
				take: limit,
				include: this.messageWithUsersInclude,
			});

			total = messages.length;
			pages = 1;
			hasMore = messages.length === limit;
		} else {
			// Index-friendly pagination: scan (chatRoomId, createdAt DESC) instead of COUNT + SKIP from start.
			const safePage = Math.max(1, page);
			const safeLimit = Math.min(Math.max(1, limit), 100);

			const batch = await this.prisma.message.findMany({
				where: messageFilter,
				orderBy: { createdAt: 'desc' },
				skip: (safePage - 1) * safeLimit,
				take: safeLimit + 1,
				include: this.messageWithUsersInclude,
			});

			hasMore = batch.length > safeLimit;
			messages = batch.slice(0, safeLimit).reverse();
			// total is omitted (expensive COUNT on large rooms); clients rely on hasMore.
			total = 0;
			pages = hasMore ? safePage + 1 : safePage;
		}

		// Note: Messages are no longer automatically marked as read when fetching
		// They will be marked as read via WebSocket when user actually views them
		// await this.markMessagesAsRead(chatRoomId, userId);

		// Transform profilePhoto to avatar for frontend compatibility
		const transformedMessages = messages.map((message) => ({
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
		}));

		const messagesWithReactions =
			await this.messageReactionsService.attachReactionsToMessages(
				transformedMessages,
				userId,
			);

		return {
			messages: messagesWithReactions,
			pagination: {
				page,
				limit,
				total,
				pages,
				hasMore,
			},
		};
	}

	/**
	 * Batch sync: for each room, compare client's last known message id with the server tail.
	 * Returns only missing messages plus authoritative unreadCount / lastMessage.
	 */
	async syncMessagesBatch(
		userId: string,
		rooms: { chatRoomId: string; lastMessageId?: string | null }[],
		limit: number = 50,
	) {
		const safeLimit = Math.min(Math.max(1, limit), 100);
		const results: Awaited<
			ReturnType<MessagesService['syncMessagesBatchForRoom']>
		>[] = [];

		for (const room of rooms) {
			results.push(
				await this.syncMessagesBatchForRoom(
					userId,
					room.chatRoomId,
					room.lastMessageId ?? null,
					safeLimit,
				),
			);
		}

		return { rooms: results };
	}

	private mapMessageForClientResponse(message: {
		id: string;
		sender: { profilePhoto?: string | null; [key: string]: unknown };
		receiver?: { profilePhoto?: string | null; [key: string]: unknown } | null;
		[key: string]: unknown;
	}) {
		return {
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
		};
	}

	private async syncMessagesBatchForRoom(
		userId: string,
		chatRoomId: string,
		clientLastMessageId: string | null,
		limit: number,
	) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			include: {
				user: { select: { role: true } },
			},
		});

		if (!participant) {
			return {
				chatRoomId,
				messages: [],
				unreadCount: 0,
				lastMessage: null,
				upToDate: true,
				skipped: true,
			};
		}

		const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: null;

		const roomFilter: Prisma.MessageWhereInput = { chatRoomId };
		if (joinedAtCutoff) {
			roomFilter.createdAt = { gte: joinedAtCutoff };
		}

		const latestMessage = await this.prisma.message.findFirst({
			where: roomFilter,
			orderBy: { createdAt: 'desc' },
			include: this.messageWithUsersInclude,
		});

		const unreadCount = participant.unreadCount ?? 0;

		if (!latestMessage) {
			return {
				chatRoomId,
				messages: [],
				unreadCount,
				lastMessage: null,
				upToDate: true,
			};
		}

		const serverLastMessage =
			this.mapMessageForClientResponse(latestMessage);

		if (
			clientLastMessageId &&
			clientLastMessageId === latestMessage.id
		) {
			const [lastWithReactions] =
				await this.messageReactionsService.attachReactionsToMessages(
					[serverLastMessage],
					userId,
				);
			return {
				chatRoomId,
				messages: [],
				unreadCount,
				lastMessage: lastWithReactions,
				upToDate: true,
			};
		}

		let messagesToReturn: typeof latestMessage[] = [];

		if (!clientLastMessageId) {
			messagesToReturn = await this.prisma.message.findMany({
				where: roomFilter,
				orderBy: { createdAt: 'desc' },
				take: limit,
				include: this.messageWithUsersInclude,
			});
			messagesToReturn = messagesToReturn.reverse();
		} else {
			const anchor = await this.prisma.message.findFirst({
				where: {
					id: clientLastMessageId,
					chatRoomId,
				},
				select: { id: true, createdAt: true },
			});

			if (!anchor) {
				messagesToReturn = await this.prisma.message.findMany({
					where: roomFilter,
					orderBy: { createdAt: 'desc' },
					take: limit,
					include: this.messageWithUsersInclude,
				});
				messagesToReturn = messagesToReturn.reverse();
			} else if (anchor.id === latestMessage.id) {
				const [lastWithReactions] =
					await this.messageReactionsService.attachReactionsToMessages(
						[serverLastMessage],
						userId,
					);
				return {
					chatRoomId,
					messages: [],
					unreadCount,
					lastMessage: lastWithReactions,
					upToDate: true,
				};
			} else {
				const afterFilter: Prisma.MessageWhereInput = {
					...roomFilter,
					createdAt: {
						gt: joinedAtCutoff
							? anchor.createdAt > joinedAtCutoff
								? anchor.createdAt
								: joinedAtCutoff
							: anchor.createdAt,
					},
				};

				messagesToReturn = await this.prisma.message.findMany({
					where: afterFilter,
					orderBy: { createdAt: 'asc' },
					take: limit,
					include: this.messageWithUsersInclude,
				});
			}
		}

		const transformed = messagesToReturn.map((m) =>
			this.mapMessageForClientResponse(m),
		);
		const messagesWithReactions =
			await this.messageReactionsService.attachReactionsToMessages(
				transformed,
				userId,
			);

		const [lastWithReactions] =
			await this.messageReactionsService.attachReactionsToMessages(
				[serverLastMessage],
				userId,
			);

		return {
			chatRoomId,
			messages: messagesWithReactions,
			unreadCount,
			lastMessage: lastWithReactions,
			upToDate: messagesWithReactions.length === 0,
			hasMore: messagesWithReactions.length === limit,
		};
	}

	/**
	 * Get files (messages with fileUrl) for a specific chat room with pagination
	 * For drivers only: files from messages after joinedAt. Other roles: full history.
	 */
	async getChatRoomFiles(
		chatRoomId: string,
		userId: string,
		page: number = 1,
		limit: number = 10,
	) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			include: {
				user: { select: { role: true } },
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: null;

		const messageFilter: any = {
			chatRoomId,
			fileUrl: {
				not: null,
			},
		};
		if (joinedAtCutoff) {
			messageFilter.createdAt = { gte: joinedAtCutoff };
		}

		// Get total count of files first (filtered by join date and fileUrl)
		const total = await this.prisma.message.count({
			where: messageFilter,
		});

		// Calculate pagination
		const skip = (page - 1) * limit;

		// Get files with pagination (newest first)
		const messages = await this.prisma.message.findMany({
			where: messageFilter,
			orderBy: { createdAt: 'desc' }, // Newest files first
			skip,
			take: limit,
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
						externalId: true,
						phone: true,
					},
				},
				receiver: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						profilePhoto: true,
						userColor: true,
						role: true,
						externalId: true,
						phone: true,
					},
				},
			},
		});

		// Transform messages to match frontend interface
		const transformedMessages = messages.map((message) => ({
			...message,
			sender: {
				...message.sender,
				avatar: message.sender.profilePhoto,
				profilePhoto: undefined,
			},
			receiver: message.receiver
				? {
						...message.receiver,
						avatar: message.receiver.profilePhoto,
						profilePhoto: undefined,
					}
				: undefined,
		}));

		const messagesWithReactions =
			await this.messageReactionsService.attachReactionsToMessages(
				transformedMessages,
				userId,
			);

		return {
			messages: messagesWithReactions,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
				hasMore: page * limit < total, // There are more files if current page * limit < total
			},
		};
	}

	/**
	 * Mark a specific message as read
	 * This is called when user views a specific message
	 */
	async markMessageAsRead(messageId: string, userId: string) {
		// Get the message to check if it's from a group chat or direct chat
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: {
				id: true,
				senderId: true,
				receiverId: true,
				chatRoomId: true,
				readBy: true,
			},
		});

		if (!message || message.senderId === userId) {
			return; // Don't mark own messages
		}

		// Check if user already read this message
		const readBy = (message.readBy as string[]) || [];
		const alreadyRead = readBy.includes(userId);

		if (alreadyRead) {
			return; // Already read
		}

		// Add user to readBy array
		const updatedReadBy = [...readBy, userId];

		// Update both isRead (global) and readBy (per-user)
		await this.prisma.message.update({
			where: { id: messageId },
			data: {
				isRead: true, // Global read status
				readBy: updatedReadBy, // Per-user read status
			},
		});

		await this.decrementParticipantUnreadCount(message.chatRoomId, userId);
	}

	/** Latest readBy/isRead for WebSocket read-receipt payloads. */
	async getMessagesReadBySnapshot(messageIds: string[]) {
		if (messageIds.length === 0) {
			return [];
		}
		const rows = await this.prisma.message.findMany({
			where: { id: { in: messageIds } },
			select: { id: true, readBy: true, isRead: true },
		});
		return rows.map((row) => ({
			id: row.id,
			readBy: (row.readBy as string[]) || [],
			isRead: row.isRead,
		}));
	}

	/**
	 * Mark a specific message as UNREAD
	 * Reverts read status and notifies chat participants via WebSocket (if provided)
	 */
	async markMessageAsUnread(
		messageId: string,
		userId: string,
		chatGateway?: any,
	) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			select: {
				id: true,
				senderId: true,
				chatRoomId: true,
				readBy: true,
				isRead: true,
			},
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		// Disallow marking own messages as unread
		if (message.senderId === userId) {
			throw new BadRequestException(
				'Cannot mark your own message as unread',
			);
		}

		// Get chat room type to determine logic
		const chatRoom = await this.prisma.chatRoom.findUnique({
			where: { id: message.chatRoomId },
			select: { type: true, participants: { select: { userId: true } } },
		});

		if (!chatRoom) {
			throw new NotFoundException('Chat room not found');
		}

		// Check if user already marked as unread
		const readBy = (message.readBy as string[]) || [];
		const userReadIndex = readBy.indexOf(userId);

		if (userReadIndex === -1) {
			return { success: true, messageId, chatRoomId: message.chatRoomId };
		}

		// Remove user from readBy array
		const updatedReadBy = readBy.filter((id) => id !== userId);

		// Apply different logic based on chat type
		if (chatRoom.type === 'DIRECT' || chatRoom.type === 'OFFER') {
			// For DIRECT and OFFER chats: set both isRead to false and remove user from readBy
			await this.prisma.message.update({
				where: { id: messageId },
				data: {
					isRead: false, // Global read status becomes false
					readBy: updatedReadBy, // Remove user from readBy
				},
			});
		} else {
			// For GROUP and LOAD chats: only remove user from readBy, keep isRead as true
			await this.prisma.message.update({
				where: { id: messageId },
				data: { readBy: updatedReadBy },
			});
		}

		await this.prisma.chatRoomParticipant.update({
			where: {
				chatRoomId_userId: {
					chatRoomId: message.chatRoomId,
					userId,
				},
			},
			data: { unreadCount: { increment: 1 } },
		});

		if (chatGateway) {
			chatGateway.server
				.to(`chat_${message.chatRoomId}`)
				.emit('messagesMarkedAsUnread', {
					chatRoomId: message.chatRoomId,
					messageIds: [messageId],
					userId,
				});

			const unreadCount = await this.getParticipantUnreadCount(
				message.chatRoomId,
				userId,
			);
			chatGateway.emitChatUnreadCountUpdated?.(
				userId,
				message.chatRoomId,
				unreadCount,
			);
		}

		return { success: true, messageId, chatRoomId: message.chatRoomId };
	}

	/**
	 * +1 unread for every participant except the sender (DIRECT, GROUP, LOAD, OFFER).
	 */
	private async incrementUnreadCountForOtherParticipants(
		chatRoomId: string,
		senderId: string,
		prisma: Prisma.TransactionClient | PrismaService = this.prisma,
	): Promise<void> {
		await prisma.chatRoomParticipant.updateMany({
			where: {
				chatRoomId,
				userId: { not: senderId },
			},
			data: { unreadCount: { increment: 1 } },
		});
	}

	async getParticipantUnreadCount(
		chatRoomId: string,
		userId: string,
	): Promise<number> {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: { chatRoomId, userId },
			},
			select: { unreadCount: true },
		});
		return participant?.unreadCount ?? 0;
	}

	private async resetParticipantUnreadCount(
		chatRoomId: string,
		userId: string,
	): Promise<void> {
		await this.prisma.chatRoomParticipant.updateMany({
			where: { chatRoomId, userId },
			data: { unreadCount: 0 },
		});
	}

	private async decrementParticipantUnreadCount(
		chatRoomId: string,
		userId: string,
	): Promise<void> {
		await this.prisma.$executeRaw`
			UPDATE "chat_room_participants"
			SET "unreadCount" = GREATEST("unreadCount" - 1, 0)
			WHERE "chatRoomId" = ${chatRoomId} AND "userId" = ${userId}
		`;
	}

	/**
	 * Mark all unread messages in a room as read for one user (single UPDATE, not per-row).
	 */
	private async batchMarkUnreadMessagesAsReadForUser(
		chatRoomId: string,
		userId: string,
		options?: {
			joinedAtCutoff?: Date | null;
			excludeOwnMessages?: boolean;
		},
	): Promise<string[]> {
		const userJsonArray = JSON.stringify([userId]);
		const excludeOwnMessages = options?.excludeOwnMessages ?? true;
		const joinedAtCutoff = options?.joinedAtCutoff ?? null;

		const whereParts: Prisma.Sql[] = [
			Prisma.sql`"chatRoomId" = ${chatRoomId}`,
			Prisma.sql`("readBy" IS NULL OR NOT ("readBy" @> ${Prisma.raw(`'${userJsonArray}'::jsonb`)}))`,
		];
		if (excludeOwnMessages) {
			whereParts.push(Prisma.sql`"senderId" <> ${userId}`);
		}
		if (joinedAtCutoff) {
			whereParts.push(Prisma.sql`"createdAt" >= ${joinedAtCutoff}`);
		}

		const rows = await this.prisma.$queryRaw<{ id: string }[]>(
			Prisma.sql`
				UPDATE "messages"
				SET
					"readBy" = COALESCE("readBy", '[]'::jsonb) || jsonb_build_array(${userId}::text),
					"isRead" = true
				WHERE ${Prisma.join(whereParts, ' AND ')}
				RETURNING "id"
			`,
		);

		return rows.map((row) => row.id);
	}

	/**
	 * Mark messages as read for a specific user in a chat room
	 * This is called when user opens the chat or scrolls through messages
	 * For group chats, marks all messages except user's own messages
	 * For direct chats, marks messages where user is the receiver
	 */
	async markMessagesAsRead(
		chatRoomId: string,
		userId: string,
	): Promise<string[]> {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: { chatRoomId, userId },
			},
			include: {
				user: { select: { role: true } },
			},
		});

		if (!participant) {
			return [];
		}

		const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: null;

		const updatedIds = await this.batchMarkUnreadMessagesAsReadForUser(
			chatRoomId,
			userId,
			{
				joinedAtCutoff,
				excludeOwnMessages: true,
			},
		);

		// Always reset counter when user opens the chat, even if messages were already in readBy
		await this.resetParticipantUnreadCount(chatRoomId, userId);

		return updatedIds;
	}

	/**
	 * Get unread message count for a user across all chat rooms
	 */
	async getUnreadCount(userId: string) {
		const result = await this.prisma.chatRoomParticipant.aggregate({
			where: { userId },
			_sum: { unreadCount: true },
		});

		return { unreadCount: result._sum.unreadCount ?? 0 };
	}

	/**
	 * Mark all unread messages as read for specific chat rooms
	 * For drivers only: considers messages after joinedAt. Other roles: entire room.
	 * This is called when user clicks "Read all" button
	 */
	async markAllMessagesAsReadByChatRooms(
		chatRoomIds: string[],
		userId: string,
	): Promise<{
		success: boolean;
		chatRoomIds: string[];
		messageIds: string[];
		messagesByChatRoom: Record<string, string[]>;
	}> {
		if (chatRoomIds.length === 0) {
			return {
				success: true,
				chatRoomIds: [],
				messageIds: [],
				messagesByChatRoom: {},
			};
		}

		const affectedChatRoomIds = new Set<string>();
		const allMessageIds: string[] = [];
		const messagesByChatRoom: Record<string, string[]> = {};

		// Process each chat room
		for (const chatRoomId of chatRoomIds) {
			try {
				// Get user's join date for this chat room (drivers only use cutoff for "read all")
				const participant = await this.prisma.chatRoomParticipant.findUnique({
					where: {
						chatRoomId_userId: {
							chatRoomId,
							userId,
						},
					},
					include: {
						user: { select: { role: true } },
					},
				});

				if (!participant) {
					// User is not a participant, skip this chat room
					continue;
				}

				const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
					? joinedAtCutoffForDriverMessages(participant.joinedAt)
					: null;

				const updatedIds = await this.batchMarkUnreadMessagesAsReadForUser(
					chatRoomId,
					userId,
					{
						joinedAtCutoff,
						// Match legacy "read all": any message where user is not in readBy yet.
						excludeOwnMessages: false,
					},
				);

				await this.resetParticipantUnreadCount(chatRoomId, userId);

				if (updatedIds.length > 0) {
					allMessageIds.push(...updatedIds);
					affectedChatRoomIds.add(chatRoomId);
					messagesByChatRoom[chatRoomId] = updatedIds;
				} else {
					affectedChatRoomIds.add(chatRoomId);
					messagesByChatRoom[chatRoomId] = [];
				}
			} catch (error) {
				// Continue processing other chat rooms if one fails
				console.error(
					`Failed to mark messages as read for chat room ${chatRoomId}:`,
					error,
				);
				continue;
			}
		}

		return {
			success: true,
			chatRoomIds: Array.from(affectedChatRoomIds),
			messageIds: allMessageIds,
			messagesByChatRoom,
		};
	}

	/**
	 * Delete a message (only by sender)
	 */
	async deleteMessage(
		messageId: string,
		userId: string,
		userRole?: string,
		chatGateway?: any,
	) {
		const message = await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				chatRoom: {
					include: {
						participants: {
							select: { userId: true },
						},
					},
				},
			},
		});

		if (!message) {
			throw new NotFoundException('Message not found');
		}

		// Drivers cannot delete messages. Others may delete own messages; admins may delete any.
		const isOwner = message.senderId === userId;
		const isAdmin = userRole === UserRole.ADMINISTRATOR;

		if (userRole === UserRole.DRIVER) {
			throw new BadRequestException('Drivers cannot delete messages');
		}

		if (!isOwner && !isAdmin) {
			throw new BadRequestException(
				'You can only delete your own messages',
			);
		}

		const readBy = (message.readBy as string[]) || [];
		const participantsToDecrement = message.chatRoom.participants.filter(
			(p) =>
				p.userId !== message.senderId &&
				!readBy.includes(p.userId),
		);

		for (const participant of participantsToDecrement) {
			await this.decrementParticipantUnreadCount(
				message.chatRoomId,
				participant.userId,
			);
		}

		// Hard delete the message from database
		await this.prisma.message.delete({
			where: { id: messageId },
		});

		// Send WebSocket notification to all participants in the chat room
		if (chatGateway) {
			const participantIds = message.chatRoom.participants.map(
				(p) => p.userId,
			);

			// Emit to all participants in the chat room
			chatGateway.server
				.to(`chat_${message.chatRoomId}`)
				.emit('messageDeleted', {
					messageId,
					chatRoomId: message.chatRoomId,
					deletedBy: userId,
					deletedByRole: userRole,
				});

			// Also emit to individual user rooms for clients that are not currently in the chat room.
			participantIds.forEach((participantId) => {
				chatGateway.server
					.to(`user_${participantId}`)
					.emit('messageDeleted', {
						messageId,
						chatRoomId: message.chatRoomId,
						deletedBy: userId,
						deletedByRole: userRole,
					});
			});

			for (const participant of participantsToDecrement) {
				const unreadCount = await this.getParticipantUnreadCount(
					message.chatRoomId,
					participant.userId,
				);
				chatGateway.emitChatUnreadCountUpdated?.(
					participant.userId,
					message.chatRoomId,
					unreadCount,
				);
			}
		}

		return {
			success: true,
			messageId,
			chatRoomId: message.chatRoomId,
			deletedBy: userId,
		};
	}

	/**
	 * Search messages in a chat room
	 * Useful for finding specific information in chat history
	 */
	async searchMessages(
		chatRoomId: string,
		userId: string,
		query: string,
		page: number = 1,
		limit: number = 20,
	) {
		// Verify user is participant
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			include: {
				user: { select: { role: true } },
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const joinedAtCutoff = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: null;

		const searchWhere: any = {
			chatRoomId,
			content: {
				contains: query,
				mode: 'insensitive' as const,
			},
		};
		if (joinedAtCutoff) {
			searchWhere.createdAt = { gte: joinedAtCutoff };
		}

		const skip = (page - 1) * limit;

		const [messages, total] = await Promise.all([
			this.prisma.message.findMany({
				where: searchWhere,
				orderBy: { createdAt: 'asc' },
				skip,
				take: limit,
				include: {
					sender: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
							profilePhoto: true,
							userColor: true,
							role: true,
							externalId: true,
							phone: true,
						},
					},
				},
			}),
			this.prisma.message.count({
				where: searchWhere,
			}),
		]);

		return {
			messages,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Get message statistics for analytics
	 * Useful for managers to monitor communication activity
	 */
	async getMessageStats(chatRoomId: string, userId: string) {
		const participant = await this.prisma.chatRoomParticipant.findUnique({
			where: {
				chatRoomId_userId: {
					chatRoomId,
					userId,
				},
			},
			include: {
				user: { select: { role: true } },
				chatRoom: { select: { createdAt: true } },
			},
		});

		if (!participant) {
			throw new NotFoundException('Chat room not found or access denied');
		}

		const periodStartDate = shouldCutOffMessagesAtJoinedAt(participant.user?.role)
			? joinedAtCutoffForDriverMessages(participant.joinedAt)
			: participant.chatRoom.createdAt;

		const [totalMessages, messagesToday, messagesThisWeek, fileMessages] =
			await Promise.all([
				this.prisma.message.count({
					where: { chatRoomId },
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						createdAt: {
							gte: new Date(new Date().setHours(0, 0, 0, 0)),
						},
					},
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						createdAt: {
							gte: new Date(
								new Date().setDate(new Date().getDate() - 7),
							),
						},
					},
				}),
				this.prisma.message.count({
					where: {
						chatRoomId,
						fileUrl: { not: null },
					},
				}),
			]);

		return {
			totalMessages,
			messagesToday,
			messagesThisWeek,
			fileMessages,
			averageMessagesPerDay:
				totalMessages > 0
					? Math.round(
							(totalMessages /
								Math.max(
									1,
									Math.ceil(
										(Date.now() -
											new Date(periodStartDate).getTime()) /
											(1000 * 60 * 60 * 24),
									),
								)) *
								100,
						) / 100
					: 0,
		};
	}

	/**
	 * Get message by ID
	 * Used for WebSocket operations like marking messages as read
	 */
	async getMessageById(messageId: string) {
		return await this.prisma.message.findUnique({
			where: { id: messageId },
			include: {
				sender: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});
	}
}
