import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { NotificationsCleanupService } from './notifications-cleanup.service';
import { NotificationsCleanupController } from './notifications-cleanup.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationsWebSocketService, NotificationsCleanupService],
  controllers: [NotificationsController, NotificationsCleanupController],
  exports: [NotificationsService, NotificationsWebSocketService, NotificationsCleanupService],
})
export class NotificationsModule {}