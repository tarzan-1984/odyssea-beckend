import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetDriverLoadsDto } from './dto/get-driver-loads.dto';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLoadsService } from './tms-driver-loads.service';

@ApiTags('TMS')
@ApiBearerAuth()
@Controller('tms')
@UseGuards(JwtAuthGuard)
export class TmsController {
	constructor(
		private readonly tmsDriverLoadsService: TmsDriverLoadsService,
		private readonly tmsDriverApplicationService: TmsDriverApplicationService,
	) {}

	@Get('driver/loads')
	@ApiOperation({
		summary: 'Proxy: TMS driver loads list',
		description:
			'Proxies GET https://www.endurance-tms.com/wp-json/tms/v1/driver/loads. All query params are provided by the mobile app and forwarded as-is (whitelisted).',
	})
	@ApiResponse({ status: 200, description: 'TMS response (proxied)' })
	async getDriverLoads(@Query() query: GetDriverLoadsDto) {
		return this.tmsDriverLoadsService.fetchDriverLoads(query);
	}

	@Post('driver/application/activate-backfill')
	@SkipAuth()
	@ApiOperation({
		summary: 'Open one-time backfill: mark active app drivers as activated in TMS',
		description:
			'Finds ACTIVE DRIVER users with last_active_app and externalId, then calls TMS driver/application/activate for each one. Intended for one-time Insomnia backfill.',
	})
	@ApiResponse({
		status: 201,
		description: 'Backfill result with total/sent/failed counters',
	})
	async backfillDriverApplicationActivated() {
		return this.tmsDriverApplicationService.backfillActivatedDriversFromLastActiveApp();
	}
}

