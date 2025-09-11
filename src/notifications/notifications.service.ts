import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { ConfigService } from '@nestjs/config';
import {
	UserData,
	ChatData,
	NotificationUserData,
} from '../types/request.types';

@Injectable()
export class NotificationsService {
	private readonly logger = new Logger(NotificationsService.name);

	constructor(
		private prisma: PrismaService,
		private mailerService: MailerService,
		private configService: ConfigService,
	) {}

	/**
	 * Send email notifications for unread messages
	 * This method is called by the cron job every 15 minutes
	 * Only send notifications for messages that haven't been notified about yet
	 */
	async sendUnreadMessageNotifications() {
		this.logger.log('Starting unread message notifications check...');

		try {
			// Get all users who have unread messages
			const usersWithUnreadMessages =
				await this.getUsersWithUnreadMessages();

			if (usersWithUnreadMessages.length === 0) {
				this.logger.log('No users with unread messages found');
				return;
			}

			this.logger.log(
				`Found ${usersWithUnreadMessages.length} users with unread messages`,
			);

			// Send notifications to each user (only for new unread messages)
			for (const userData of usersWithUnreadMessages) {
				await this.sendNotificationToUserIfNew(userData);
			}

			this.logger.log('Unread message notifications check completed');
		} catch (error) {
			this.logger.error(
				'Error in sendUnreadMessageNotifications:',
				error,
			);
		}
	}

	/**
	 * Get users who have unread messages with their chat room details
	 */
	private async getUsersWithUnreadMessages() {
		const unreadMessages = await this.prisma.message.findMany({
			where: {
				isRead: false,
				receiverId: { not: null },
			},
			include: {
				receiver: {
					select: {
						id: true,
						email: true,
						firstName: true,
						lastName: true,
					},
				},
				sender: {
					select: {
						firstName: true,
						lastName: true,
					},
				},
				chatRoom: {
					select: {
						id: true,
						name: true,
						type: true,
					},
				},
			},
			orderBy: {
				createdAt: 'desc',
			},
		});

		// Group messages by user and chat room
		const userChatMap = new Map<string, Map<string, ChatData>>();

		for (const message of unreadMessages) {
			const userId = message.receiverId!;
			const chatRoomId = message.chatRoomId;

			if (!userChatMap.has(userId)) {
				userChatMap.set(userId, new Map());
			}

			const userChats = userChatMap.get(userId)!;
			if (!userChats.has(chatRoomId)) {
				userChats.set(chatRoomId, {
					chatRoom: {
						id: message.chatRoom.id,
						name: message.chatRoom.name || '',
						type: message.chatRoom.type,
					},
					messages: [],
					unreadCount: 0,
				});
			}

			userChats.get(chatRoomId)!.messages.push({
				id: message.id,
				content: message.content,
				sender: message.sender
					? {
							firstName: message.sender.firstName,
							lastName: message.sender.lastName,
						}
					: undefined,
			});
			userChats.get(chatRoomId)!.unreadCount++;
		}

		// Convert to array format
		const result: NotificationUserData[] = [];

		for (const [userId, chatMap] of userChatMap) {
			const userData = unreadMessages.find(
				(m) => m.receiverId === userId,
			)?.receiver;
			if (userData) {
				result.push({
					user: {
						id: userData.id,
						email: userData.email,
						firstName: userData.firstName,
						lastName: userData.lastName,
					},
					chats: Array.from(chatMap.values()),
				});
			}
		}

		return result;
	}

	/**
	 * Send notification email to a specific user only if there are new unread messages
	 * that haven't been notified about yet
	 */
	private async sendNotificationToUserIfNew(userData: NotificationUserData) {
		const { user, chats } = userData;

		// Get all message IDs from all chats
		const allMessageIds = chats.flatMap((chat) =>
			chat.messages.map((msg) => msg.id),
		);

		// Check if we've already sent notifications for these messages
		const hasNewMessages = await this.hasNewUnreadMessages(
			user.id,
			allMessageIds,
		);

		if (!hasNewMessages) {
			this.logger.log(
				`No new unread messages for user ${user.email}, skipping notification`,
			);
			return;
		}

		// Filter chats to only include those with new messages
		const chatsWithNewMessages = await this.filterChatsWithNewMessages(
			user.id,
			chats,
		);

		if (chatsWithNewMessages.length === 0) {
			this.logger.log(
				`No new messages in any chat for user ${user.email}, skipping notification`,
			);
			return;
		}

		const totalUnreadCount = chatsWithNewMessages.reduce(
			(sum, chat) => sum + (chat.unreadCount || 0),
			0,
		);

		try {
			const subject = `You have ${totalUnreadCount} unread messages in Odyssea`;
			const html = this.generateEmailTemplate(user, chatsWithNewMessages);
			const text = this.generateTextTemplate(user, chatsWithNewMessages);

			const success = await this.mailerService.sendEmail(
				user.email,
				subject,
				text,
				html,
			);

			if (success) {
				this.logger.log(
					`Notification sent successfully to ${user.email}`,
				);

				// Record that we've sent notifications for these messages
				await this.recordNotificationSent(
					user.id,
					chatsWithNewMessages,
				);
			} else {
				this.logger.error(
					`Failed to send notification to ${user.email}`,
				);
			}
		} catch (error) {
			this.logger.error(
				`Error sending notification to ${user.email}:`,
				error,
			);
		}
	}

	/**
	 * Send a notification email to a specific user (legacy method for backward compatibility)
	 */
	private async sendNotificationToUser(userData: NotificationUserData) {
		const { user, chats } = userData;
		const totalUnreadCount = chats.reduce(
			(sum, chat) => sum + chat.unreadCount,
			0,
		);

		try {
			const subject = `You have ${totalUnreadCount} unread messages in Odyssea`;
			const html = this.generateEmailTemplate(user, chats);
			const text = this.generateTextTemplate(user, chats);

			const success = await this.mailerService.sendEmail(
				user.email,
				subject,
				text,
				html,
			);

			if (success) {
				this.logger.log(
					`Notification sent successfully to ${user.email}`,
				);
			} else {
				this.logger.error(
					`Failed to send notification to ${user.email}`,
				);
			}
		} catch (error) {
			this.logger.error(
				`Error sending notification to ${user.email}:`,
				error,
			);
		}
	}

	/**
	 * Generate HTML email template for unread messages
	 */
	private generateEmailTemplate(user: UserData, chats: ChatData[]): string {
		const frontendUrl =
			(this.configService.get<string>('app.frontendUrl') as string) ||
			'http://localhost:3000';

		let chatListHtml = '';
		chats.forEach((chat) => {
			const chatName = chat.chatRoom.name || `${chat.chatRoom.type} Chat`;
			const chatUrl = `${frontendUrl}/chats/${chat.chatRoom.id}`;
			chatListHtml += `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: #333;">
            <a href="${chatUrl}" style="color: #007bff; text-decoration: none;">${chatName}</a>
          </h3>
          <p style="margin: 0 0 10px 0; color: #666;">
            Unread messages: <strong>${chat.unreadCount}</strong>
          </p>
          <p style="margin: 0; color: #888; font-size: 14px;">
				Last message from: ${chat.messages[0]?.sender?.firstName || 'Unknown'} ${chat.messages[0]?.sender?.lastName || 'User'}
          </p>
        </div>
      `;
		});

		return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Messages in Odyssea</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 28px;">Odyssea</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Freight Management System</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Hello, ${user.firstName}!</h2>
          <p style="font-size: 16px; margin-bottom: 25px;">
            You have unread messages in your chats. Don't miss important information!
          </p>
          
          ${chatListHtml}
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${frontendUrl}/chats" 
               style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Open All Chats
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 14px; color: #666;">
            <p>This is an automatic notification from the Odyssea system.</p>
            <p>If you don't want to receive these notifications, please contact your administrator.</p>
          </div>
        </div>
      </body>
      </html>
    `;
	}

	/**
	 * Generate plain text email template for unread messages
	 */
	private generateTextTemplate(user: UserData, chats: ChatData[]): string {
		const frontendUrl =
			(this.configService.get<string>('app.frontendUrl') as string) ||
			'http://localhost:3000';

		let chatList = '';
		chats.forEach((chat) => {
			const chatName = chat.chatRoom.name || `${chat.chatRoom.type} Chat`;
			chatList += `
				${chatName}:
				- Unread messages: ${chat.unreadCount}
							- Last message from: ${chat.messages[0]?.sender?.firstName || 'Unknown'} ${chat.messages[0]?.sender?.lastName || 'User'}
							- Link: ${frontendUrl}/chats/${chat.chatRoom.id}
				
				`;
		});

		return `
			Hello, ${user.firstName}!
			
			You have unread messages in Odyssea chats:
			
			${chatList}
			
			Open all chats: ${frontendUrl}/chats
			
			---
			This is an automatic notification from the Odyssea system.
			If you don't want to receive these notifications, please contact your administrator.
			    `.trim();
	}

	/**
	 * Create a notification record in the database
	 */
	async createNotification(
		userId: string,
		title: string,
		message: string,
		type: string,
	) {
		return this.prisma.notification.create({
			data: {
				userId,
				title,
				message,
				type,
			},
		});
	}

	/**
	 * Get notifications for a user
	 */
	async getUserNotifications(
		userId: string,
		page: number = 1,
		limit: number = 20,
	) {
		const skip = (page - 1) * limit;

		const [notifications, total] = await Promise.all([
			this.prisma.notification.findMany({
				where: { userId },
				orderBy: { createdAt: 'desc' },
				skip,
				take: limit,
			}),
			this.prisma.notification.count({
				where: { userId },
			}),
		]);

		return {
			notifications,
			pagination: {
				page,
				limit,
				total,
				pages: Math.ceil(total / limit),
			},
		};
	}

	/**
	 * Mark the notification as read
	 */
	async markNotificationAsRead(notificationId: string, userId: string) {
		return this.prisma.notification.updateMany({
			where: {
				id: notificationId,
				userId,
			},
			data: {
				isRead: true,
			},
		});
	}

	/**
	 * Mark all notifications as read for a user
	 */
	async markAllNotificationsAsRead(userId: string) {
		return this.prisma.notification.updateMany({
			where: {
				userId,
				isRead: false,
			},
			data: {
				isRead: true,
			},
		});
	}

	/**
	 * Check if there are new unread messages that haven't been notified about
	 */
	private async hasNewUnreadMessages(
		userId: string,
		messageIds: string[],
	): Promise<boolean> {
		if (messageIds.length === 0) {
			return false;
		}

		// Get all message IDs that we've already sent notifications for
		const sentNotifications = await this.prisma.notificationSent.findMany({
			where: {
				userId,
				notificationType: 'unread_messages',
				messageIds: {
					hasSome: messageIds,
				},
			},
			select: {
				messageIds: true,
			},
		});

		// Flatten all previously notified message IDs
		const alreadyNotifiedMessageIds = new Set(
			sentNotifications.flatMap(
				(notification) => notification.messageIds,
			),
		);

		// Check if any of the current message IDs are new
		return messageIds.some(
			(messageId) => !alreadyNotifiedMessageIds.has(messageId),
		);
	}

	/**
	 * Filter chats to only include those with new messages that haven't been notified about
	 */
	private async filterChatsWithNewMessages(
		userId: string,
		chats: ChatData[],
	): Promise<ChatData[]> {
		const filteredChats: ChatData[] = [];

		for (const chat of chats) {
			const messageIds = chat.messages.map((msg) => msg.id);

			// Get already notified message IDs for this user
			const sentNotifications =
				await this.prisma.notificationSent.findMany({
					where: {
						userId,
						notificationType: 'unread_messages',
						messageIds: {
							hasSome: messageIds,
						},
					},
					select: {
						messageIds: true,
					},
				});

			const alreadyNotifiedMessageIds = new Set(
				sentNotifications.flatMap(
					(notification) => notification.messageIds,
				),
			);

			// Filter messages to only include new ones
			const newMessages = chat.messages.filter(
				(msg) => !alreadyNotifiedMessageIds.has(msg.id),
			);

			if (newMessages.length > 0) {
				filteredChats.push({
					chatRoom: chat.chatRoom,
					messages: newMessages,
					unreadCount: newMessages.length,
				});
			}
		}

		return filteredChats;
	}

	/**
	 * Record that we've sent notifications for specific messages
	 */
	private async recordNotificationSent(userId: string, chats: ChatData[]) {
		try {
			// Group messages by chat room
			for (const chat of chats) {
				const messageIds = chat.messages.map((msg) => msg.id);

				if (messageIds.length > 0) {
					await this.prisma.notificationSent.create({
						data: {
							userId,
							chatRoomId: chat.chatRoom.id,
							messageIds,
							notificationType: 'unread_messages',
						},
					});
				}
			}
		} catch (error) {
			this.logger.error('Error recording notification sent:', error);
		}
	}

	/**
	 * Clean up old notification sent records (older than 7 days)
	 * This method should be called periodically to prevent the table from growing too large
	 */
	async cleanupOldNotificationRecords() {
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		try {
			const result = await this.prisma.notificationSent.deleteMany({
				where: {
					sentAt: {
						lt: sevenDaysAgo,
					},
				},
			});

			this.logger.log(
				`Cleaned up ${result.count} old notification records`,
			);
			return result.count;
		} catch (error) {
			this.logger.error(
				'Error cleaning up old notification records:',
				error,
			);
			return 0;
		}
	}
}
