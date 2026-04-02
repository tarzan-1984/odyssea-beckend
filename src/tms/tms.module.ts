import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLocationBatchService } from './tms-driver-location-batch.service';
import { TmsLocationBatchScheduler } from './tms-location-batch.scheduler';

@Module({
	imports: [ConfigModule, AppSettingsModule],
	providers: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
		TmsLocationBatchScheduler,
	],
	exports: [
		TmsDriverApplicationService,
		TmsDriverLocationBatchService,
	],
})
export class TmsModule {}
