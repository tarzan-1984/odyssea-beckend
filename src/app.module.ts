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
	geoDatabaseConfig,
	appConfig,
	jwtConfig,
	swaggerConfig,
	mailerConfig,
	externalApiConfig,
} from './config/env.config';
import { GeoPrismaModule } from './prisma/geo-prisma.module';
import { StorageModule } from './storage/storage.module';
import { OffersModule } from './offers/offers.module';
import { AppSettingsModule } from './app-settings/app-settings.module';
import { PublicModule } from './public/public.module';
import { MessageTemplatesModule } from './message-templates/message-templates.module';
import { NotificationSoundsModule } from './notification-sounds/notification-sounds.module';
import { TrackingModule } from './tracking/tracking.module';
import { GeocodingModule } from './geocoding/geocoding.module';
import { BidRatesModule } from './bid-rates/bid-rates.module';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			load: [
				databaseConfig,
				geoDatabaseConfig,
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
		GeoPrismaModule,
		FirebaseModule, // Global module for Firebase Admin
		AuthModule,
		UsersModule,
		MailerModule,
		ChatsModule,
		NotificationsModule,
		StorageModule,
		OffersModule,
		AppSettingsModule,
		PublicModule,
		MessageTemplatesModule,
		NotificationSoundsModule,
		TrackingModule,
		GeocodingModule,
		BidRatesModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule {}
