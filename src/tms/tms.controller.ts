import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetDriverLoadsDto } from './dto/get-driver-loads.dto';
import { TmsDriverLoadsService } from './tms-driver-loads.service';

@ApiTags('TMS')
@ApiBearerAuth()
@Controller('tms')
@UseGuards(JwtAuthGuard)
export class TmsController {
	constructor(private readonly tmsDriverLoadsService: TmsDriverLoadsService) {}

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
}

