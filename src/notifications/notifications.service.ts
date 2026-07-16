import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { Notification, User } from '@prisma/client';
import { FcmPushService } from './fcm-push.service';
import { ExpoPushService } from './expo-push.service';
import { MailerService } from '../mailer/mailer.service';
import { plainTextToHtmlEmail } from '../mailer/plain-text-email-html.util';
import {
	findUserByExternalIdPreferDriver,
	userWhereDriverByExternalId,
} from '../users/user-external-id-lookup.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsWebSocketService: NotificationsWebSocketService,
    private readonly fcmPushService: FcmPushService,
    private readonly expoPushService: ExpoPushService,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Inform driver that their status changed (best-effort).
   * Clients will sync the actual status from backend on foreground.
   */
  async sendDriverStatusChangedPush(params: {
    userId: string;
    driverStatus: string | null;
  }): Promise<void> {
    const next = (params.driverStatus ?? '').trim();
    const title = 'Status updated';
    const body = 'Your status has changed. Open the app to see the updates.';
    await this.sendPushToUser({
      userId: params.userId,
      title,
      body,
      payload: {
        type: 'driver_status_changed',
        driverStatus: next,
      },
    });
  }

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

  private async sendPushToUser(data: {
    userId: string;
    title: string;
    body: string;
    subtitle?: string;
    imageUrl?: string;
    payload?: Record<string, string>;
    /** Android FCM: show only body text (no title) for longer visible message. */
    androidBodyOnly?: boolean;
  }): Promise<void> {
    try {
      const userPrefs = await this.prisma.user.findUnique({
        where: { id: data.userId },
        select: { notificationsEnabled: true },
      });
      if (userPrefs && userPrefs.notificationsEnabled === false) {
        this.logger.debug(
          `Skipping push for user ${data.userId} (notifications disabled)`,
        );
        return;
      }

      const tokens = await this.prisma.pushToken.findMany({
        where: { userId: data.userId },
        select: { token: true },
      });
      if (tokens.length === 0) return;

      const allTokens = tokens.map((item) => item.token).filter(Boolean);
      const fcmTokens: string[] = [];
      const expoPushTokens: string[] = [];

      for (const token of allTokens) {
        if (token.startsWith('ExponentPushToken[')) {
          expoPushTokens.push(token);
        } else {
          fcmTokens.push(token);
        }
      }

      if (fcmTokens.length > 0) {
        const payload = {
          ...(data.payload ?? {}),
          fullMessage: data.body,
        };
        await this.fcmPushService.sendToTokens(fcmTokens, {
          title: data.title,
          body: data.body,
          subtitle: data.subtitle,
          imageUrl: data.imageUrl,
          data: payload,
          androidBodyOnly: data.androidBodyOnly,
        });
      }

      if (expoPushTokens.length > 0) {
        const payload = {
          ...(data.payload ?? {}),
          fullMessage: data.body,
        };
        await this.expoPushService.send(
          expoPushTokens.map((token) => ({
            to: token,
            title: data.title,
            subtitle: data.subtitle,
            body: data.body,
            data: payload,
            sound: 'livechat.wav',
            priority: 'high' as const,
            ...(data.imageUrl ? { largeIcon: data.imageUrl } : {}),
          })),
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to send push notification to user ${data.userId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Admin-only: send a custom push message to a single user.
   * Broadcast to all ACTIVE users is handled by CustomPushBackgroundService.
   */
  async sendCustomPush(params: {
    message: string;
    userId: string;
    offerId?: number;
    offerTitle?: string;
  }): Promise<{ targeted: true; users: number }> {
    const message = (params.message ?? '').trim();
    if (!message) return { targeted: true, users: 0 };

    const offerId =
      params.offerId != null && Number.isFinite(params.offerId)
        ? Math.trunc(params.offerId)
        : undefined;
    const offerTitle = (params.offerTitle ?? '').trim();

    if (offerTitle) {
      await this.sendPushToUser({
        userId: params.userId,
        title: `Offer - ${offerTitle}`,
        body: message,
        payload: {
          type: 'offer_unavailable',
          offerTitle,
          ...(offerId != null ? { offerId: String(offerId) } : {}),
        },
      });
    } else {
      await this.sendPushToUser({
        userId: params.userId,
        title: 'Odyssea',
        body: message,
        androidBodyOnly: true,
        payload: { type: 'admin_broadcast' },
      });
    }

    return { targeted: true, users: 1 };
  }

  async sendCustomEmail(params: {
    message: string;
    subject?: string;
    userId?: string;
    externalId?: string;
    email?: string;
    from?: string;
    replyTo?: string;
    cc?: string | string[];
  }): Promise<{ sent: boolean; email?: string; reason?: string }> {
    const message = (params.message ?? '').trim();
    const subject = (params.subject ?? 'Odyssea').trim() || 'Odyssea';
    if (!message) {
      return { sent: false, reason: 'empty_message' };
    }

    let email = (params.email ?? '').trim();
    let userId = (params.userId ?? '').trim();

    if (!email && (params.externalId ?? '').trim()) {
      const user = await this.prisma.user.findFirst({
        where: userWhereDriverByExternalId(params.externalId!.trim()),
        select: { id: true, email: true },
      });
      if (user) {
        userId = user.id;
        email = (user.email ?? '').trim();
      }
    }

    if (!email && userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      email = (user?.email ?? '').trim();
    }

    if (!email) {
      return { sent: false, reason: 'no_email' };
    }

    const sent = await this.mailerService.sendEmail(
      email,
      subject,
      message,
      plainTextToHtmlEmail(message),
      {
        from: params.from,
        replyTo: params.replyTo,
        cc: params.cc,
      },
    );
    if (!sent) {
      return { sent: false, email, reason: 'send_failed' };
    }

    return { sent: true, email };
  }

  async sendAdminBroadcastPushToUser(userId: string, message: string): Promise<void> {
    await this.sendPushToUser({
      userId,
      title: 'Odyssea',
      body: message,
      androidBodyOnly: true,
      payload: { type: 'admin_broadcast' },
    });
  }

  /**
   * Open TMS integration: send a custom push to a user by TMS externalId.
   */
  async sendTmsPushByExternalId(params: {
    externalId: string;
    message: string;
    title?: string;
    payload?: Record<string, string>;
  }): Promise<{
    externalId: string;
    userId: string | null;
    sent: boolean;
    pushTokens: number;
    reason?: 'user_not_found' | 'no_push_tokens';
  }> {
    const externalId = params.externalId.trim();
    const message = params.message.trim();

    const user = await findUserByExternalIdPreferDriver(this.prisma, externalId, {
      id: true,
      pushTokens: { select: { id: true } },
    });

    if (!user) {
      return {
        externalId,
        userId: null,
        sent: false,
        pushTokens: 0,
        reason: 'user_not_found',
      };
    }

    const pushTokens = user.pushTokens.length;
    if (pushTokens === 0) {
      return {
        externalId,
        userId: user.id,
        sent: false,
        pushTokens,
        reason: 'no_push_tokens',
      };
    }

    await this.sendPushToUser({
      userId: user.id,
      title: params.title?.trim() || 'Odyssea',
      body: message,
      payload: { type: 'tms_message', externalId, ...(params.payload ?? {}) },
    });

    return {
      externalId,
      userId: user.id,
      sent: true,
      pushTokens,
    };
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
    const title = 'Added to Group Chat';
    const chatName = chatRoom.name || 'Group Chat';
    const message = `You were added to the group chat "${chatName}"`;
    const avatar = chatRoom.avatar
      ? chatRoom.avatar
      : this.generateChatInitials(chatName);

    const recipients = participants.filter(
      (participant) => participant.userId !== adminUserId,
    );

    const notifications = await Promise.all(
      recipients.map((participant) =>
        this.createNotification({
          userId: participant.userId,
          title,
          message,
          type: 'group_chat_created',
          avatar,
        }),
      ),
    );

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
   * Create notification when driver makes a bid on an offer.
   * Creates DB record + sends via WebSocket.
   */
  async createOfferBidNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
    driverName: string;
    driverAvatar?: string | null;
  }): Promise<Notification> {
    const normalizedOfferTitle =
      String(data.offerTitle || '').trim() || `Offer #${data.offerId}`;
    const title = 'New offer bid';
    const message = `${data.driverName} placed a bid for offer "${normalizedOfferTitle}".`;
    const avatar = data.driverAvatar ?? this.generateChatInitials(data.driverName);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_bid',
      avatar,
    });

    await this.sendPushToUser({
      userId: data.userId,
      title,
      body: message,
      payload: {
        type: 'offer_bid',
        offerId: String(data.offerId),
        offerTitle: normalizedOfferTitle,
      },
    });

    return notification;
  }

  /**
   * Create notification when driver refuses an offer.
   * Creates DB record + sends via WebSocket.
   */
  async createOfferRefusedNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
    driverName: string;
    driverAvatar?: string | null;
  }): Promise<Notification> {
    const normalizedOfferTitle =
      String(data.offerTitle || '').trim() || `Offer #${data.offerId}`;
    const title = 'Offer declined';
    const message = `${data.driverName} declined the offer "${normalizedOfferTitle}".`;
    const avatar = data.driverAvatar ?? this.generateChatInitials(data.driverName);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_refused',
      avatar,
    });

    await this.sendPushToUser({
      userId: data.userId,
      title,
      body: message,
      payload: {
        type: 'offer_refused',
        offerId: String(data.offerId),
        offerTitle: normalizedOfferTitle,
      },
    });

    return notification;
  }

  /**
   * Create notification when driver extends bid time on an offer.
   * Creates DB record + sends via WebSocket.
   */
  async createOfferExtendTimeNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
    driverName: string;
    driverAvatar?: string | null;
  }): Promise<Notification> {
    const title = data.driverName;
    const message = `extended bid time on offer "${data.offerTitle}"`;
    const avatar = data.driverAvatar ?? this.generateChatInitials(data.driverName);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_extend_time',
      avatar,
    });

    return notification;
  }

  async createOfferSelectedNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
  }): Promise<Notification> {
    const normalizedOfferTitle =
      String(data.offerTitle || '').trim() || `Offer #${data.offerId}`;
    const title = 'Offer Assignment Confirmed';
    const message = `You have been selected for the offer "${normalizedOfferTitle}".`;
    const avatar = this.generateChatInitials(normalizedOfferTitle);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_selected',
      avatar,
    });

    await this.sendPushToUser({
      userId: data.userId,
      title,
      body: message,
      payload: {
        type: 'offer_selected',
        offerId: String(data.offerId),
        offerTitle: normalizedOfferTitle,
      },
    });

    return notification;
  }

  async createOfferAddedNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
  }): Promise<Notification> {
    const normalizedOfferTitle =
      String(data.offerTitle || '').trim() || `Offer #${data.offerId}`;
    const title = 'Offer Assignment';
    const message = `You have a new load offer "${normalizedOfferTitle}".`;
    const avatar = this.generateChatInitials(normalizedOfferTitle);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_added',
      avatar,
    });

    await this.sendPushToUser({
      userId: data.userId,
      title,
      body: message,
      payload: {
        type: 'offer_added',
        offerId: String(data.offerId),
        offerTitle: normalizedOfferTitle,
      },
    });

    return notification;
  }

  /**
   * Notify driver that an existing offer was updated and bids were reset.
   */
  async createOfferUpdatedNotification(data: {
    userId: string;
    offerId: number;
    offerTitle: string;
    pickUp: string;
    delivery: string;
  }): Promise<Notification> {
    const routeLabel =
      data.pickUp.trim() && data.delivery.trim()
        ? `${data.pickUp.trim()} – ${data.delivery.trim()}`
        : String(data.offerTitle || '').trim() || `Offer #${data.offerId}`;
    const title = 'Offer updated';
    const message =
      `The load offer for ${routeLabel} has been updated. ` +
      'Please review the changes that have been made. If you are still interested, kindly resubmit your rate.';
    const avatar = this.generateChatInitials(routeLabel);

    const notification = await this.createNotification({
      userId: data.userId,
      title,
      message,
      type: 'offer_updated',
      avatar,
    });

    await this.sendPushToUser({
      userId: data.userId,
      title,
      body: message,
      payload: {
        type: 'offer_updated',
        offerId: String(data.offerId),
        offerTitle: String(data.offerTitle || '').trim() || routeLabel,
      },
    });

    return notification;
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