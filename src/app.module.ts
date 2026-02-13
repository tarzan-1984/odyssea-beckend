import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MailerModule } from './mailer/mailer.module';
import { ChatsModule } from './chats/chats.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FirebaseModule } from './firebase/firebase.module';

import {
	databaseConfig,
	appConfig,
	jwtConfig,
	swaggerConfig,
	mailerConfig,
	externalApiConfig,
} from './config/env.config';
import { StorageModule } from './storage/storage.module';
import { OffersModule } from './offers/offers.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [
				databaseConfig,
				appConfig,
				jwtConfig,
				swaggerConfig,
				mailerConfig,
				externalApiConfig,
			],
			envFilePath: '.env',
		}),
		ScheduleModule.forRoot(),
		PrismaModule,
		FirebaseModule, // Global module for Firebase Admin
		AuthModule,
		UsersModule,
		MailerModule,
		ChatsModule,
		NotificationsModule,
		StorageModule,
		OffersModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule {}
