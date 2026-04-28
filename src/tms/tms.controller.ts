import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common';
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

	@Post('load/status')
	@SkipAuth()
	@ApiOperation({
		summary: 'Open TMS webhook: load status changed',
		description:
			'Receives load status updates from TMS and logs the payload. No side effects yet. offer_id is optional.',
	})
	@ApiResponse({
		status: 201,
		description: 'Webhook accepted and logged',
	})
	async receiveLoadStatusChanged(
		@Body()
		body: {
			load_id?: string | number;
			driver_id?: string | number;
			load_status?: string;
			offer_id?: string | number | null;
		},
	) {
		const loadId =
			body?.load_id != null ? String(body.load_id).trim() : '';
		const driverId =
			body?.driver_id != null ? String(body.driver_id).trim() : '';
		const loadStatus =
			typeof body?.load_status === 'string' ? body.load_status.trim() : '';
		const offerId =
			body?.offer_id != null && String(body.offer_id).trim() !== ''
				? String(body.offer_id).trim()
				: null;

		if (!loadId) {
			throw new BadRequestException('load_id is required');
		}
		if (!driverId) {
			throw new BadRequestException('driver_id is required');
		}
		if (!loadStatus) {
			throw new BadRequestException('load_status is required');
		}

		console.log('[TMS Load Status Webhook]', {
			load_id: loadId,
			driver_id: driverId,
			load_status: loadStatus,
			offer_id: offerId,
		});

		return {
			success: true,
			data: {
				loadId,
				driverId,
				loadStatus,
				offerId,
			},
		};
	}
}

