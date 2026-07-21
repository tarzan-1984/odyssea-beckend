import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { ChatRoomsService } from './chat-rooms.service';
import { MessagesService } from './messages.service';
import { MessageReactionsService } from './message-reactions.service';
import { ChatRoomsController } from './chat-rooms.controller';
import { MessagesController } from './messages.controller';
import { MessagesArchiveController } from './messages-archive.controller';
import { LoadChatController } from './load-chat.controller';
import { UpdateLoadChatController } from './update-load-chat.controller';
import { DeleteLoadChatController } from './delete-load-chat.controller';
import { ChatGateway } from './chat.gateway';
import { FileUploadService } from './file-upload.service';
import { MessagesArchiveService } from './messages-archive.service';
import { MessagesArchiveScheduler } from './messages-archive.scheduler';
import { DeliveredLoadChatCleanupScheduler } from './delivered-load-chat-cleanup.scheduler';
import { LoadChatTmsSyncService } from './load-chat-tms-sync.service';
import { LoadChatLogService } from './load-chat-log.service';
import { LoadChatLogRetentionScheduler } from './load-chat-log-retention.scheduler';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { S3Service } from '../s3/s3.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { StorageModule } from '../storage/storage.module';

@Module({
	imports: [
		PrismaModule,
		NotificationsModule, // Import NotificationsModule to get FcmPushService
		AppSettingsModule,
		StorageModule,
		JwtModule.registerAsync({
			imports: [ConfigModule],
			useFactory: (configService: ConfigService) => ({
				secret: configService.get('JWT_SECRET'),
				signOptions: { expiresIn: '1d' },
			}),
			inject: [ConfigService],
		}),
		MulterModule.register({
			dest: './uploads',
		}),
	],
	controllers: [
		ChatRoomsController,
		MessagesController,
		MessagesArchiveController,
		LoadChatController,
		UpdateLoadChatController,
		DeleteLoadChatController,
	],
	providers: [
		ChatRoomsService,
		MessagesService,
		MessageReactionsService,
		MessagesArchiveService,
		MessagesArchiveScheduler,
		DeliveredLoadChatCleanupScheduler,
		LoadChatTmsSyncService,
		LoadChatLogService,
		LoadChatLogRetentionScheduler,
		ArchiveBackgroundService,
		S3Service,
		ChatGateway,
		FileUploadService,
		NotificationsService,
		// NotificationsWebSocketService is provided by NotificationsModule (imported above)
	],
	exports: [
		ChatRoomsService,
		MessagesService,
		MessageReactionsService,
		MessagesArchiveService,
		FileUploadService,
		ChatGateway,
		LoadChatTmsSyncService,
		LoadChatLogService,
	],
})
export class ChatsModule {}
