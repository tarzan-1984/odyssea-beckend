import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TmsDriverApplicationService } from './tms-driver-application.service';

@Module({
	imports: [ConfigModule],
	providers: [TmsDriverApplicationService],
	exports: [TmsDriverApplicationService],
})
export class TmsModule {}
