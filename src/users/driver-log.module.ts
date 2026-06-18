import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverLogService } from './driver-log.service';

@Module({
	imports: [PrismaModule],
	providers: [DriverLogService],
	exports: [DriverLogService],
})
export class DriverLogModule {}
