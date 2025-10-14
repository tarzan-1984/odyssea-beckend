import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { ChatRoomsService } from './chat-rooms.service';
import { MessagesService } from './messages.service';
import { ChatRoomsController } from './chat-rooms.controller';
import { MessagesController } from './messages.controller';
import { MessagesArchiveController } from './messages-archive.controller';
import { ChatGateway } from './chat.gateway';
import { FileUploadService } from './file-upload.service';
import { MessagesArchiveService } from './messages-archive.service';
import { MessagesArchiveScheduler } from './messages-archive.scheduler';
import { ArchiveBackgroundService } from './services/archive-background.service';
import { S3Service } from '../s3/s3.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
	imports: [
		PrismaModule,
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
	controllers: [ChatRoomsController, MessagesController, MessagesArchiveController],
	providers: [
		ChatRoomsService,
		MessagesService,
		MessagesArchiveService,
		MessagesArchiveScheduler,
		ArchiveBackgroundService,
		S3Service,
		ChatGateway,
		FileUploadService,
	],
	exports: [ChatRoomsService, MessagesService, MessagesArchiveService, FileUploadService],
})
export class ChatsModule {}
