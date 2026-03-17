import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OffersRealtimeService } from './offers-realtime.service';

@Module({
	imports: [PrismaModule, ChatsModule, NotificationsModule],
	controllers: [OffersController],
	providers: [OffersService, OffersRealtimeService],
	exports: [OffersService, OffersRealtimeService],
})
export class OffersModule {}
