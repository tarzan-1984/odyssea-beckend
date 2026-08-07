import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoadBoardShipmentsController } from './load-board-shipments.controller';
import { LoadBoardShipmentsService } from './load-board-shipments.service';
import { LoadBoardRealtimeService } from './load-board-realtime.service';
import { LoadBoardUnpostScheduler } from './load-board-unpost.scheduler';

@Module({
	imports: [PrismaModule, NotificationsModule],
	controllers: [LoadBoardShipmentsController],
	providers: [
		LoadBoardShipmentsService,
		LoadBoardRealtimeService,
		LoadBoardUnpostScheduler,
	],
	exports: [LoadBoardShipmentsService, LoadBoardRealtimeService],
})
export class LoadBoardShipmentsModule {}
