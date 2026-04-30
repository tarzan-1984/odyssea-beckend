import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLocationBatchService } from './tms-driver-location-batch.service';
import { TmsLoadDraftService } from './tms-load-draft.service';
import { TmsDriverDraftLoadsService } from './tms-driver-draft-loads.service';
import { TmsAppDraftLoadsService } from './tms-app-draft-loads.service';
import { TmsLocationBatchScheduler } from './tms-location-batch.scheduler';
import { TmsDriverLoadsService } from './tms-driver-loads.service';
import { TmsLoadDetailsService } from './tms-load-details.service';
import { TmsController } from './tms.controller';

@Module({
	imports: [ConfigModule, AppSettingsModule, NotificationsModule],
	providers: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
		TmsLoadDraftService,
		TmsDriverDraftLoadsService,
		TmsAppDraftLoadsService,
		TmsLocationBatchScheduler,
		TmsDriverLoadsService,
		TmsLoadDetailsService,
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
	],
})
export class TmsModule {}
