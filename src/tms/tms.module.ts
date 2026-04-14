import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLocationBatchService } from './tms-driver-location-batch.service';
import { TmsLoadDraftService } from './tms-load-draft.service';
import { TmsDriverDraftLoadsService } from './tms-driver-draft-loads.service';
import { TmsAppDraftLoadsService } from './tms-app-draft-loads.service';
import { TmsLocationBatchScheduler } from './tms-location-batch.scheduler';

@Module({
	imports: [ConfigModule, AppSettingsModule],
	providers: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
		TmsLoadDraftService,
		TmsDriverDraftLoadsService,
		TmsAppDraftLoadsService,
		TmsLocationBatchScheduler,
	],
	exports: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
		TmsLoadDraftService,
		TmsDriverDraftLoadsService,
		TmsAppDraftLoadsService,
	],
})
export class TmsModule {}
