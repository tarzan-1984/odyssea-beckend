import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsWebSocketService } from './notifications-websocket.service';
import { NotificationsCleanupService } from './notifications-cleanup.service';
import { NotificationsCleanupController } from './notifications-cleanup.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ExpoPushService } from './expo-push.service';
import { FcmPushService } from './fcm-push.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
	imports: [PrismaModule, FirebaseModule],
	providers: [
		NotificationsService,
		NotificationsWebSocketService,
		NotificationsCleanupService,
		ExpoPushService,
		FcmPushService,
	],
	controllers: [NotificationsController, NotificationsCleanupController],
	exports: [
		NotificationsService,
		NotificationsWebSocketService,
		NotificationsCleanupService,
		ExpoPushService,
		FcmPushService,
	],
})
export class NotificationsModule {}
