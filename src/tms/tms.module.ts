import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { ChatsModule } from '../chats/chats.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverLogModule } from '../users/driver-log.module';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverApplicationBackfillBackgroundService } from './tms-driver-application-backfill-background.service';
import { TmsDriverLocationBatchService } from './tms-driver-location-batch.service';
import { TmsDriverAppStatusBatchService } from './tms-driver-app-status-batch.service';
import { TmsLoadDraftService } from './tms-load-draft.service';
import { TmsDriverDraftLoadsService } from './tms-driver-draft-loads.service';
import { TmsAppDraftLoadsService } from './tms-app-draft-loads.service';
import { DriverTrackingRetentionScheduler } from './driver-tracking-retention.scheduler';
import { TmsLocationBatchScheduler } from './tms-location-batch.scheduler';
import { TmsAppStatusBatchScheduler } from './tms-app-status-batch.scheduler';
import { TmsDriverLoadsService } from './tms-driver-loads.service';
import { TmsLoadDetailsService } from './tms-load-details.service';
import { TmsLoadRouteGeocodeService } from './tms-load-route-geocode.service';
import { TmsLoadTrackingService } from './tms-load-tracking.service';
import { TmsController } from './tms.controller';

@Module({
	imports: [
		ConfigModule,
		AppSettingsModule,
		NotificationsModule,
		DriverLogModule,
		ChatsModule,
	],
	providers: [
		TmsDriverApplicationService,
		TmsDriverApplicationBackfillBackgroundService,
		TmsDriverLocationBatchService,
		TmsDriverAppStatusBatchService,
		TmsLoadDraftService,
		TmsDriverDraftLoadsService,
		TmsAppDraftLoadsService,
		TmsLocationBatchScheduler,
		TmsAppStatusBatchScheduler,
		DriverTrackingRetentionScheduler,
		TmsDriverLoadsService,
		TmsLoadDetailsService,
		TmsLoadRouteGeocodeService,
		TmsLoadTrackingService,
	],
	controllers: [TmsController],
	exports: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
		TmsLoadDraftService,
		TmsDriverDraftLoadsService,
		TmsAppDraftLoadsService,
		TmsDriverLoadsService,
		TmsLoadDetailsService,
		TmsLoadTrackingService,
	],
})
export class TmsModule {}
