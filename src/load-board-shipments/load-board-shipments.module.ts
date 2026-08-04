import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LoadBoardShipmentsController } from './load-board-shipments.controller';
import { LoadBoardShipmentsService } from './load-board-shipments.service';

@Module({
	imports: [PrismaModule],
	controllers: [LoadBoardShipmentsController],
	providers: [LoadBoardShipmentsService],
	exports: [LoadBoardShipmentsService],
})
export class LoadBoardShipmentsModule {}
