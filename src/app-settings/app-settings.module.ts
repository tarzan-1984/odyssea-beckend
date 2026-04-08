import { Module } from '@nestjs/common';
import { AppSettingsController } from './app-settings.controller';
import { AppSettingsService } from './app-settings.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
	imports: [NotificationsModule],
	controllers: [AppSettingsController],
	providers: [AppSettingsService],
	exports: [AppSettingsService],
})
export class AppSettingsModule {}
