import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Param,
	Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TmsLoadEnrichmentDto } from '../tms/dto/tms-load-enrichment.dto';
import { TmsLoadTrackingService } from '../tms/tms-load-tracking.service';

/** Public load map data — no JWT (guest tracking page). */
@ApiTags('Public')
@Controller('public/tracking')
export class PublicLoadTrackingController {
	constructor(private readonly tmsLoadTrackingService: TmsLoadTrackingService) {}

	@Get('load/:loadId')
	@ApiOperation({
		summary: 'Public load tracking map data',
		description:
			'TMS load + drivers, tracking history, route geocode. No authentication.',
	})
	@ApiResponse({ status: 200, description: 'Load tracking payload' })
	async getLoadTracking(@Param('loadId') loadId: string) {
		const cleanLoadId = loadId.trim();
		if (!cleanLoadId) {
			throw new BadRequestException('loadId is required');
		}

		return this.tmsLoadTrackingService.getLoadMapPayload(cleanLoadId);
	}

	@Post('load/:loadId/enrichment')
	@ApiOperation({
		summary: 'Public load enrichment from DB',
		description:
			'Drivers, tracking history, route geocode. TMS load is fetched separately (e.g. via Next.js). No authentication.',
	})
	@ApiResponse({ status: 200, description: 'Enrichment payload' })
	async getLoadEnrichment(
		@Param('loadId') loadId: string,
		@Body() body: TmsLoadEnrichmentDto,
	) {
		const cleanLoadId = loadId.trim();
		if (!cleanLoadId) {
			throw new BadRequestException('loadId is required');
		}

		return this.tmsLoadTrackingService.buildLoadEnrichment(
			cleanLoadId,
			body.meta_data ?? {},
		);
	}
}
