import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { NotificationSoundsController } from './notification-sounds.controller';
import { NotificationSoundsService } from './notification-sounds.service';

@Module({
	imports: [PrismaModule, S3Module],
	controllers: [NotificationSoundsController],
	providers: [NotificationSoundsService],
	exports: [NotificationSoundsService],
})
export class NotificationSoundsModule {}

