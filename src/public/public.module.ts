import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { MailerModule } from '../mailer/mailer.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
	imports: [MailerModule, PrismaModule, AppSettingsModule],
	controllers: [PublicController],
})
export class PublicModule {}

