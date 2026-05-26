import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { PublicLoadTrackingController } from './public-load-tracking.controller';
import { MailerModule } from '../mailer/mailer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { TmsModule } from '../tms/tms.module';

@Module({
	imports: [MailerModule, PrismaModule, AppSettingsModule, TmsModule],
	controllers: [PublicController, PublicLoadTrackingController],
})
export class PublicModule {}

