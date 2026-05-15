import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { SyncController } from './sync.controller';
import { DriversWebhookController } from './drivers-webhook.controller';
import { UsersService } from './users.service';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TmsModule } from '../tms/tms.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';

@Module({
	imports: [
		PrismaModule,
		ConfigModule,
		NotificationsModule,
		TmsModule,
		AppSettingsModule,
	],
		controllers: [UsersController, SyncController, DriversWebhookController],
	providers: [
		UsersService,
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
	],
	exports: [
		UsersService,
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
	],
})
export class UsersModule {}
