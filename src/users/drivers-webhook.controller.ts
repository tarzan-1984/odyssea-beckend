import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
} from '@nestjs/common';
import {
	ApiBody,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { TmsDriverRemoveWebhookDto } from './dto/tms-driver-remove-webhook.dto';

@ApiTags('Drivers')
@Controller('drivers')
export class DriversWebhookController {
	private readonly logger = new Logger(DriversWebhookController.name);

	constructor(private readonly usersService: UsersService) {}

	@Post('remove')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'TMS webhook: driver soft-remove or restore (open, no auth)',
		description:
			'Sets users.deactivateAccount from TMS driver id (users.externalId). No API key or JWT.',
	})
	@ApiBody({ type: TmsDriverRemoveWebhookDto })
	@ApiResponse({
		status: 200,
		description: 'Updated user flags',
	})
	@ApiResponse({ status: 404, description: 'No user with this externalId' })
	async receiveDriverRemove(@Body() body: TmsDriverRemoveWebhookDto) {
		this.logger.log(
			`[TMS driver webhook] driverId=${body.driverId} event=${body.event}`,
		);
		return this.usersService.applyTmsDriverRemoveWebhook(
			body.driverId,
			body.event,
		);
	}
}
