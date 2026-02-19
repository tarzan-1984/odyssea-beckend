import { Controller, Get, Post, Patch, Body, Query, Param, UseGuards } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
	ApiBody,
	ApiQuery,
	ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';
import { AddDriversToOfferDto } from './dto/add-drivers-to-offer.dto';

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
	constructor(private readonly offersService: OffersService) {}

	@Get()
	@ApiOperation({
		summary: 'Get offers with pagination and filters',
		description:
			'Returns paginated offers. Filters: is_expired (true = only expired by action_time vs NY time, false = only not expired), user_id (external_user_id). Each offer includes drivers array (externalId, firstName, lastName from users).',
	})
	@ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
	@ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
	@ApiQuery({
		name: 'is_expired',
		required: false,
		type: Boolean,
		description:
			'true = only expired, false = only not expired (vs NY time)',
	})
	@ApiQuery({ name: 'user_id', required: false, type: String })
	@ApiQuery({
		name: 'sort_order',
		required: false,
		enum: ['action_time_asc', 'action_time_desc'],
		description: 'Default: action_time_asc (soonest to expire first)',
	})
	@ApiResponse({ status: 200, description: 'Paginated offers with drivers' })
	async getOffers(@Query() query: GetOffersQueryDto) {
		return this.offersService.findAllPaginated(query);
	}

	@Post()
	@ApiOperation({
		summary: 'Create an offer',
		description:
			'Creates a new offer and rate_offers entries for each selected driver. Times stored in America/New_York.',
	})
	@ApiBody({ type: CreateOfferDto })
	@ApiResponse({
		status: 201,
		description: 'Offer created successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - validation failed',
	})
	@ApiResponse({
		status: 401,
		description: 'Unauthorized',
	})
	async create(@Body() dto: CreateOfferDto) {
		return this.offersService.create(dto);
	}

	@Patch(':id/drivers/:driverExternalId')
	@ApiOperation({
		summary: 'Deactivate driver in offer',
		description:
			'Sets active=false for the rate_offer row (offer_id + driver_id by externalId). Driver will no longer appear in offer drivers list.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({ name: 'driverExternalId', description: 'Driver externalId (User.externalId)' })
	@ApiResponse({ status: 200, description: 'Driver deactivated successfully' })
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async removeDriverFromOffer(
		@Param('id') id: string,
		@Param('driverExternalId') driverExternalId: string,
	) {
		return this.offersService.removeDriverFromOffer(id, driverExternalId);
	}

	@Patch(':id/drivers')
	@ApiOperation({
		summary: 'Add drivers to an offer',
		description:
			'Adds selected drivers to the offer: creates rate_offers rows and appends driver IDs to offer.drivers. Skips drivers already in the offer.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiBody({ type: AddDriversToOfferDto })
	@ApiResponse({ status: 200, description: 'Drivers added successfully' })
	@ApiResponse({ status: 400, description: 'Bad request' })
	@ApiResponse({ status: 404, description: 'Offer not found' })
	async addDriversToOffer(
		@Param('id') id: string,
		@Body() dto: AddDriversToOfferDto,
	) {
		return this.offersService.addDriversToOffer(id, dto);
	}
}
