import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { NotificationsCleanupService } from './notifications-cleanup.service';
import { NotificationsCleanupController } from './notifications-cleanup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpoPushService } from './expo-push.service';

@Module({
	imports: [PrismaModule],
	providers: [
		NotificationsService,
		NotificationsWebSocketService,
		NotificationsCleanupService,
		ExpoPushService,
	],
	controllers: [NotificationsController, NotificationsCleanupController],
	exports: [
		NotificationsService,
		NotificationsWebSocketService,
		NotificationsCleanupService,
		ExpoPushService,
	],
})
export class NotificationsModule {}
