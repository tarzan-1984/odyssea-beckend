import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLocationService } from './tms-driver-location.service';

@Module({
	imports: [ConfigModule],
	providers: [TmsDriverApplicationService, TmsDriverLocationService],
	exports: [TmsDriverApplicationService, TmsDriverLocationService],
})
export class TmsModule {}
