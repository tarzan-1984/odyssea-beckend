import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverLogController } from './driver-log.controller';
import { DriverLogRetentionScheduler } from './driver-log-retention.scheduler';
import { DriverLogService } from './driver-log.service';

@Module({
	imports: [PrismaModule],
	controllers: [DriverLogController],
	providers: [DriverLogService, DriverLogRetentionScheduler],
	exports: [DriverLogService],
})
export class DriverLogModule {}
