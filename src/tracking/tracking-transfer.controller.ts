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
		summary: 'Transfer load chat participants from one driver to another',
		description:
			'Replaces old_tracking participant with new_tracking across LOAD chats matching id_loads. If old participant is absent, new participant is still added. Messages are not modified.',
	})
	@ApiResponse({ status: 200, description: 'Transfer applied' })
	async transfer(@Body() dto: TrackingTransferDto) {
		return await this.trackingTransferService.transfer(dto);
	}
}

