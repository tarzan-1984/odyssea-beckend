import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatsModule } from '../chats/chats.module';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';

@Module({
	imports: [PrismaModule, ChatsModule],
	controllers: [OffersController],
	providers: [OffersService],
	exports: [OffersService],
})
export class OffersModule {}
