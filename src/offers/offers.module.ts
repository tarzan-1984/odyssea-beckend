import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TmsModule } from '../tms/tms.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OffersRealtimeService } from './offers-realtime.service';
import { OffersCleanupService } from './offers-cleanup.service';
import { OfferPostCreateBackgroundService } from './offer-post-create-background.service';

@Module({
	imports: [
		PrismaModule,
		ChatsModule,
		NotificationsModule,
		TmsModule,
		AppSettingsModule,
	],
	controllers: [OffersController],
	providers: [
		OffersService,
		OffersRealtimeService,
		OffersCleanupService,
		OfferPostCreateBackgroundService,
	],
	exports: [OffersService, OffersRealtimeService],
})
export class OffersModule {}
