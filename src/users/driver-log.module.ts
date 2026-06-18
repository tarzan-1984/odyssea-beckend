import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverLogRetentionScheduler } from './driver-log-retention.scheduler';
import { DriverLogService } from './driver-log.service';

@Module({
	imports: [PrismaModule],
	providers: [DriverLogService, DriverLogRetentionScheduler],
	exports: [DriverLogService],
})
export class DriverLogModule {}
