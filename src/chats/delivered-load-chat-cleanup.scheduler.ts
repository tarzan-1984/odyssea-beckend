import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { ChatGateway } from './chat.gateway';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Injectable()
export class DeliveredLoadChatCleanupScheduler {
  private readonly logger = new Logger(DeliveredLoadChatCleanupScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly archiveBackgroundService: ArchiveBackgroundService,
    private readonly appSettingsService: AppSettingsService,
    @Inject(ChatGateway) private readonly chatGateway: ChatGateway,
  ) {}

  /** Every 3 hours: remove LOAD chats whose deliveryAt is older than configured hours. */
  @Cron('0 */3 * * *')
  async cleanupStaleDeliveredLoadChats() {
    let cutoff: Date;
    try {
      cutoff = await this.appSettingsService.getDeliveredLoadChatArchiveCutoffDate();
    } catch (error) {
      this.logger.error(
        'Failed to read delivered LOAD chat archive hours from app settings',
        error,
      );
      return;
    }

    let chats;
    try {
      chats = await this.prisma.chatRoom.findMany({
        where: {
          type: 'LOAD',
          deliveryAt: { not: null, lte: cutoff },
        },
        select: {
          id: true,
          loadId: true,
          deliveryAt: true,
          participants: { select: { userId: true } },
        },
      });
    } catch (error) {
      this.logger.error('Failed to fetch delivered LOAD chats for cleanup', error);
      return;
    }

    if (chats.length === 0) {
      return;
    }

    this.logger.log(
      `Delivered LOAD chat cleanup: ${chats.length} chat(s) with deliveryAt <= ${cutoff.toISOString()}`,
    );

    for (const chat of chats) {
      try {
        for (const participant of chat.participants) {
          this.chatGateway.server
            .to(`user_${participant.userId}`)
            .emit('chatRoomDeleted', { chatRoomId: chat.id, deletedBy: 'system' });
        }
        await this.archiveBackgroundService.startFullArchiveAndDelete(chat.id);
      } catch (error) {
        this.logger.error(
          `Delivered LOAD chat cleanup failed for chatRoomId=${chat.id} loadId=${chat.loadId ?? 'n/a'}`,
          error,
        );
      }
    }
  }
}
