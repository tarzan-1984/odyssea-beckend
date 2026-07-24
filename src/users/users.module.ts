import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersController } from './users.controller';
import { SyncController } from './sync.controller';
import {
	DriversWebhookController,
	TmsDriverRatingSyncController,
} from './drivers-webhook.controller';
import { UsersService } from './users.service';
import { ImportDriversService } from './services/import-drivers.service';
import { ImportDriversBackgroundService } from './services/import-drivers-background.service';
import { ImportUsersService } from './services/import-users.service';
import { ImportUsersBackgroundService } from './services/import-users-background.service';
import { UserDevicesUserIdBackfillService } from './services/user-devices-user-id-backfill.service';
import { UserDevicesUserIdBackfillBackgroundService } from './services/user-devices-user-id-backfill-background.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TmsModule } from '../tms/tms.module';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { DriverLogModule } from './driver-log.module';

@Module({
	imports: [
		PrismaModule,
		ConfigModule,
		NotificationsModule,
		TmsModule,
		AppSettingsModule,
		GeocodingModule,
		DriverLogModule,
	],
		controllers: [
			UsersController,
			SyncController,
			DriversWebhookController,
			TmsDriverRatingSyncController,
		],
	providers: [
		UsersService,
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
		UserDevicesUserIdBackfillService,
		UserDevicesUserIdBackfillBackgroundService,
	],
	exports: [
		UsersService,
		ImportDriversService,
		ImportDriversBackgroundService,
		ImportUsersService,
		ImportUsersBackgroundService,
		UserDevicesUserIdBackfillService,
		UserDevicesUserIdBackfillBackgroundService,
	],
})
export class UsersModule {}
