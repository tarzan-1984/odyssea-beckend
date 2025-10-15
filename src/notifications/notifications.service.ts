import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { Notification, User } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsWebSocketService: NotificationsWebSocketService,
  ) {}

  /**
   * Create a new notification
   */
  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    avatar?: string;
  }): Promise<Notification> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId: data.userId,
          title: data.title,
          message: data.message,
          type: data.type,
          avatar: data.avatar,
        },
      });

      this.logger.log(`Created notification for user ${data.userId}: ${data.title}`);
      
      // Send real-time notification via WebSocket
      await this.notificationsWebSocketService.sendNotificationToUser(data.userId, notification);
      
      // Send updated unread count
      const unreadCount = await this.getUnreadCount(data.userId);
      await this.notificationsWebSocketService.sendUnreadCountToUser(data.userId, unreadCount);
      
      return notification;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${data.userId}:`, error);
      throw error;
    }
  }

  /**
   * Generate initials from first and last name
   */
  private generateInitials(firstName: string, lastName: string): string {
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastInitial = lastName.charAt(0).toUpperCase();
    return firstInitial + lastInitial;
  }

  /**
   * Generate chat initials from chat name
   */
  private generateChatInitials(chatName: string): string {
    const words = chatName.trim().split(/\s+/);
    
    if (words.length === 1) {
      // Single word: take first two letters
      const word = words[0];
      return word.length >= 2 
        ? word.substring(0, 2).toUpperCase()
        : word.charAt(0).toUpperCase() + word.charAt(0).toUpperCase();
    } else {
      // Multiple words: take first letter of first two words
      const firstInitial = words[0].charAt(0).toUpperCase();
      const secondInitial = words[1].charAt(0).toUpperCase();
      return firstInitial + secondInitial;
    }
  }

  /**
   * Create notification for new private chat
   */
  async createPrivateChatNotification(
    creator: { id: string; firstName: string; lastName: string; profilePhoto: string | null },
    recipientId: string,
    chatRoomId: string
  ): Promise<Notification> {
    const title = 'New Private Chat';
    const message = `${creator.firstName} ${creator.lastName} created a new private chat with you`;
    
    // Use profile photo if available, otherwise generate initials
    let avatar: string;
    if (creator.profilePhoto) {
      avatar = creator.profilePhoto;
    } else {
      avatar = this.generateInitials(creator.firstName, creator.lastName);
    }
    
    return this.createNotification({
      userId: recipientId,
      title,
      message,
      type: 'private_chat_created',
      avatar,
    });
  }

  /**
   * Create notifications for new group chat
   */
  async createGroupChatNotifications(
    chatRoom: { id: string; name: string | null; avatar?: string | null },
    participants: { userId: string; role: string }[],
    adminUserId: string
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    
    // Create notifications for all participants except admin
    for (const participant of participants) {
      if (participant.userId !== adminUserId) {
        const title = 'Added to Group Chat';
        const chatName = chatRoom.name || 'Group Chat';
        const message = `You were added to the group chat "${chatName}"`;
        
        // Use chat avatar if available, otherwise generate initials from chat name
        let avatar: string;
        if (chatRoom.avatar) {
          avatar = chatRoom.avatar;
        } else {
          avatar = this.generateChatInitials(chatName);
        }
        
        const notification = await this.createNotification({
          userId: participant.userId,
          title,
          message,
          type: 'group_chat_created',
          avatar,
        });
        
        notifications.push(notification);
      }
    }
    
    return notifications;
  }

  /**
   * Create notifications when a user leaves a group chat
   */
  async createUserLeftGroupNotifications(
    leavingUser: { id: string; firstName: string; lastName: string; profilePhoto: string | null },
    chatRoom: { id: string; name: string | null },
    remainingParticipants: { userId: string }[]
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    
    const title = 'User Left Group Chat';
    const chatName = chatRoom.name || 'Group Chat';
    const message = `${leavingUser.firstName} ${leavingUser.lastName} left the group chat "${chatName}"`;
    
    // Use leaving user's profile photo if available, otherwise generate initials
    let avatar: string;
    if (leavingUser.profilePhoto) {
      avatar = leavingUser.profilePhoto;
    } else {
      avatar = this.generateInitials(leavingUser.firstName, leavingUser.lastName);
    }
    
    // Create notifications for all remaining participants
    for (const participant of remainingParticipants) {
      const notification = await this.createNotification({
        userId: participant.userId,
        title,
        message,
        type: 'user_left_group_chat',
        avatar,
      });
      
      notifications.push(notification);
    }
    
    return notifications;
  }

  /**
   * Create notifications when participants are added to a group chat
   */
  async createParticipantsAddedNotifications(
    addedUsers: { id: string; firstName: string; lastName: string }[],
    chatRoom: { id: string; name: string | null; avatar?: string | null },
    allParticipants: { userId: string }[],
    adminUserId: string
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    
    const title = 'New Members Added';
    const chatName = chatRoom.name || 'Group Chat';
    
    // Create a list of added user names
    const addedUserNames = addedUsers.map(user => `${user.firstName} ${user.lastName}`).join(', ');
    const message = `${addedUserNames} ${addedUsers.length === 1 ? 'was' : 'were'} added to the group chat "${chatName}"`;
    
    // Use chat avatar if available, otherwise generate initials from chat name
    let avatar: string;
    if (chatRoom.avatar) {
      avatar = chatRoom.avatar;
    } else {
      avatar = this.generateChatInitials(chatName);
    }
    
    // Create notifications for all participants except admin
    for (const participant of allParticipants) {
      if (participant.userId !== adminUserId) {
        const notification = await this.createNotification({
          userId: participant.userId,
          title,
          message,
          type: 'participants_added_to_group_chat',
          avatar,
        });
        
        notifications.push(notification);
      }
    }
    
    return notifications;
  }

  /**
   * Create notifications when a participant is removed from a group chat by admin
   */
  async createParticipantRemovedNotifications(
    removedUser: { id: string; firstName: string; lastName: string },
    chatRoom: { id: string; name: string | null; avatar?: string | null },
    allParticipants: { userId: string }[],
    adminUserId: string
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    
    const title = 'Member Removed from Group Chat';
    const chatName = chatRoom.name || 'Group Chat';
    const message = `${removedUser.firstName} ${removedUser.lastName} was removed from the group chat "${chatName}"`;
    
    // Use chat avatar if available, otherwise generate initials from chat name
    let avatar: string;
    if (chatRoom.avatar) {
      avatar = chatRoom.avatar;
    } else {
      avatar = this.generateChatInitials(chatName);
    }
    
    // Create notifications for all participants except admin
    for (const participant of allParticipants) {
      if (participant.userId !== adminUserId) {
        const notification = await this.createNotification({
          userId: participant.userId,
          title,
          message,
          type: 'participant_removed_from_group_chat',
          avatar,
        });
        
        notifications.push(notification);
      }
    }
    
    return notifications;
  }

  /**
   * Get notifications for a user with pagination
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 8
  ): Promise<{ notifications: Notification[]; total: number; hasMore: boolean; unreadCount: number }> {
    try {
      const skip = (page - 1) * limit;
      
      const [notifications, total, unreadCount] = await Promise.all([
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({
          where: { userId },
        }),
        this.prisma.notification.count({
          where: { 
            userId,
            isRead: false 
          },
        }),
      ]);

      const hasMore = skip + notifications.length < total;

      return {
        notifications,
        total,
        hasMore,
        unreadCount,
      };
    } catch (error) {
      this.logger.error(`Failed to get notifications for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification | null> {
    try {
      const notification = await this.prisma.notification.updateMany({
        where: {
          id: notificationId,
          userId: userId, // Ensure user can only update their own notifications
        },
        data: {
          isRead: true,
        },
      });

      const updatedNotification = await this.prisma.notification.findUnique({
        where: { id: notificationId },
      });

      // Send updated unread count via WebSocket
      const unreadCount = await this.getUnreadCount(userId);
      await this.notificationsWebSocketService.sendUnreadCountToUser(userId, unreadCount);

      return updatedNotification;
    } catch (error) {
      this.logger.error(`Failed to mark notification ${notificationId} as read:`, error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      this.logger.log(`Marked all notifications as read for user ${userId}`);
      
      // Send updated unread count via WebSocket (should be 0)
      await this.notificationsWebSocketService.sendUnreadCountToUser(userId, 0);
    } catch (error) {
      this.logger.error(`Failed to mark all notifications as read for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get unread notifications count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to get unread count for user ${userId}:`, error);
      throw error;
    }
  }
}