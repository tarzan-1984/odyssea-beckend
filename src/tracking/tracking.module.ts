import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TrackingTransferController } from './tracking-transfer.controller';
import { TrackingTransferService } from './tracking-transfer.service';

@Module({
	imports: [PrismaModule],
	controllers: [TrackingTransferController],
	providers: [TrackingTransferService],
})
export class TrackingModule {}

