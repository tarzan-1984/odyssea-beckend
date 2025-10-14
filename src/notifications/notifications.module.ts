import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [NotificationsService, NotificationsWebSocketService],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationsWebSocketService],
})
export class NotificationsModule {}