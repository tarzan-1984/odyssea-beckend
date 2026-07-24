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
import { TmsDriverRatingWebhookDto } from './dto/tms-driver-rating-webhook.dto';

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

	@Post('rating')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'TMS webhook: driver average rating changed (open, no auth)',
		description:
			'Updates users.driver_rating from TMS driver_id (users.externalId) and average_rating.',
	})
	@ApiBody({ type: TmsDriverRatingWebhookDto })
	@ApiResponse({
		status: 200,
		description: 'Updated driver rating',
	})
	@ApiResponse({ status: 400, description: 'Invalid payload' })
	@ApiResponse({ status: 404, description: 'No user with this externalId' })
	async receiveDriverRating(@Body() body: TmsDriverRatingWebhookDto) {
		this.logger.log(
			`[TMS driver webhook] driver_id=${body.driver_id} average_rating=${body.average_rating}`,
		);
		return this.usersService.applyTmsDriverRatingWebhook(
			body.driver_id,
			body.average_rating,
		);
	}
}

/** Path TMS was given for rating sync webhooks. */
@ApiTags('TMS')
@Controller('tms/driver/rating')
export class TmsDriverRatingSyncController {
	private readonly logger = new Logger(TmsDriverRatingSyncController.name);

	constructor(private readonly usersService: UsersService) {}

	@Post('sync')
	@HttpCode(HttpStatus.OK)
	@ApiOperation({
		summary: 'TMS webhook: driver average rating sync (open, no auth)',
		description:
			'Finds DRIVER by users.externalId = driver_id and updates users.driver_rating from average_rating.',
	})
	@ApiBody({ type: TmsDriverRatingWebhookDto })
	@ApiResponse({
		status: 200,
		description: 'Updated driver rating',
	})
	@ApiResponse({ status: 400, description: 'Invalid payload' })
	@ApiResponse({ status: 404, description: 'No driver with this externalId' })
	async syncDriverRating(@Body() body: TmsDriverRatingWebhookDto) {
		this.logger.log(
			`[TMS driver rating sync] driver_id=${body.driver_id} average_rating=${body.average_rating}`,
		);
		return this.usersService.applyTmsDriverRatingWebhook(
			body.driver_id,
			body.average_rating,
		);
	}
}
