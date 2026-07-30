import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TrackingTransferDto } from './dto/tracking-transfer.dto';
import { TrackingTransferService } from './tracking-transfer.service';

@ApiTags('tracking')
@Controller('tracking')
export class TrackingTransferController {
	constructor(private readonly trackingTransferService: TrackingTransferService) {}

	@Post('transfer')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary:
			'Replace tracking-role participants in manage-team load chats',
		description:
			'For each membership: find non-archived LOAD chats with dispatcher_id (non-driver externalId), skip exclude_loads. For each non-empty role field (tracking, morning_tracking, nightshift_tracking, tracking-tl-daytime, tracking-tl-nightshift, tracking-tl-morningshift): remove participants with that UserRole and add listed non-driver externalIds. Logged to load_chats_logs with source=tms and request action.',
	})
	@ApiResponse({ status: 200, description: 'Transfer applied' })
	async transfer(@Body() dto: TrackingTransferDto) {
		return await this.trackingTransferService.transfer(dto);
	}
}
