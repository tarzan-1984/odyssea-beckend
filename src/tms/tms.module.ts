import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLocationService } from './tms-driver-location.service';
import { TmsDriverLocationBatchService } from './tms-driver-location-batch.service';
import { TmsLocationBatchScheduler } from './tms-location-batch.scheduler';

@Module({
	imports: [ConfigModule, AppSettingsModule],
	providers: [
		TmsDriverApplicationService,
		TmsDriverLocationService,
		TmsDriverLocationBatchService,
		TmsLocationBatchScheduler,
	],
	exports: [
		TmsDriverApplicationService,
		TmsDriverLocationService,
		TmsDriverLocationBatchService,
	],
})
export class TmsModule {}
