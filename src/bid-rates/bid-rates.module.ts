import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BidRatesController } from './bid-rates.controller';
import { BidRatesService } from './bid-rates.service';

@Module({
	imports: [PrismaModule, ChatsModule, NotificationsModule],
	controllers: [BidRatesController],
	providers: [BidRatesService],
	exports: [BidRatesService],
})
export class BidRatesModule {}
