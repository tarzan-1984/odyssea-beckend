import {
	Controller,
	Get,
	Post,
	Patch,
	Body,
	Query,
	Param,
	ParseIntPipe,
	UseGuards,
	Request,
} from '@nestjs/common';
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
import { ChatRoomsService } from '../chats/chat-rooms.service';
import { ChatGateway } from '../chats/chat.gateway';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';
import { AddDriversToOfferDto } from './dto/add-drivers-to-offer.dto';
import { SetDriverRateDto } from './dto/set-driver-rate.dto';
import { ExtendDriverTimeDto } from './dto/extend-driver-time.dto';
import { OffersRealtimeService } from './offers-realtime.service';

/** Get first and last route point locations for chat name (first = pick up, last = delivery) */
function getRouteEndpoints(route: Array<{ location?: string }> | undefined): {
	pickUp: string;
	delivery: string;
} {
	if (!Array.isArray(route) || route.length === 0) {
		return { pickUp: '', delivery: '' };
	}
	const first = route[0];
	const last = route.length > 1 ? route[route.length - 1] : first;
	const pickUp = (first?.location && String(first.location).trim()) || '';
	const delivery = (last?.location && String(last.location).trim()) || '';
	return { pickUp, delivery };
}

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
	constructor(
		private readonly offersService: OffersService,
		private readonly chatRoomsService: ChatRoomsService,
		private readonly chatGateway: ChatGateway,
		private readonly offersRealtimeService: OffersRealtimeService,
	) {}

	@Get()
	@ApiOperation({
		summary: 'Get offers with pagination and filters',
		description:
			'Returns paginated offers. Filters: is_expired, user_id (external_user_id), driver_id (offers where drivers contains this externalId; rate_offers filtered to this driver). Each offer includes drivers array.',
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
	@ApiQuery({ name: 'driver_id', required: false, type: String })
	@ApiQuery({
		name: 'sort_order',
		required: false,
		enum: ['action_time_asc', 'action_time_desc'],
		description:
			'Default: action_time_asc (soonest to expire first by action_time in Unix seconds)',
	})
	@ApiResponse({ status: 200, description: 'Paginated offers with drivers' })
	async getOffers(@Query() query: GetOffersQueryDto) {
		return this.offersService.findAllPaginated(query);
	}

	@Get(':id')
	@ApiOperation({
		summary: 'Get one offer by id',
		description:
			'Returns a single offer with drivers array. Optional driver_id filters nested driver data to one driver view.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiQuery({ name: 'driver_id', required: false, type: String })
	@ApiResponse({ status: 200, description: 'Offer found' })
	@ApiResponse({ status: 404, description: 'Offer not found' })
	async getOfferById(
		@Param('id', ParseIntPipe) id: number,
		@Query('driver_id') driverId?: string,
	) {
		return this.offersService.findOneById(id, driverId);
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
	async create(
		@Body() dto: CreateOfferDto,
		@Request() req: { user: { id: string } },
	) {
		const offer = await this.offersService.create(dto);
		const { pickUp, delivery } = getRouteEndpoints(dto.route);
		// Create OFFER chats for each ACTIVE driver
		const createdChats =
			await this.chatRoomsService.createOfferChatsForNewOffer(
				offer.id,
				req.user.id,
				dto.driverIds ?? [],
				pickUp,
				delivery,
			);
		for (const { chatRoom, participantIds } of createdChats) {
			this.chatGateway.notifyChatRoomCreated(chatRoom, participantIds);
		}
		return offer;
	}

	@Patch(':id/deactivate-offer')
	@ApiOperation({
		summary: 'Deactivate offer',
		description:
			'Sets active=false for the offer. Offer will display with red header and no action buttons.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiResponse({ status: 200, description: 'Offer deactivated successfully' })
	@ApiResponse({ status: 404, description: 'Offer not found' })
	async deactivateOffer(@Param('id', ParseIntPipe) id: number) {
		const result = await this.offersService.deactivateOffer(id);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			'offer_deactivated',
		);
		return result;
	}

	@Patch(':id/drivers/:driverExternalId')
	@ApiOperation({
		summary: 'Deactivate driver in offer',
		description:
			'Sets active=false for the rate_offer row (offer_id + driver_id by externalId). Driver will no longer appear in offer drivers list.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({
		name: 'driverExternalId',
		description: 'Driver externalId (User.externalId)',
	})
	@ApiResponse({
		status: 200,
		description: 'Driver deactivated successfully',
	})
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async removeDriverFromOffer(
		@Param('id', ParseIntPipe) id: number,
		@Param('driverExternalId') driverExternalId: string,
	) {
		const result = await this.offersService.removeDriverFromOffer(
			id,
			driverExternalId,
		);
		await this.offersRealtimeService.emitOfferUpdated(id, 'driver_removed', {
			affectedExternalIds: [driverExternalId],
		});
		return result;
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
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: AddDriversToOfferDto,
	) {
		const result = await this.offersService.addDriversToOffer(id, dto);
		await this.offersRealtimeService.emitOfferUpdated(id, 'drivers_added', {
			affectedExternalIds: result.addedDriverExternalIds ?? [],
		});
		return result;
	}

	@Patch(':id/drivers/:driverExternalId/rate')
	@ApiOperation({
		summary: 'Set driver rate and ETA for an offer',
		description:
			'Updates rate_offers row for the given offer and driver: sets rate, driver_eta and action_time (Unix time in seconds, based on current time plus rateTimeMinutes).',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({
		name: 'driverExternalId',
		description: 'Driver externalId (User.externalId)',
	})
	@ApiBody({ type: SetDriverRateDto })
	@ApiResponse({ status: 200, description: 'Rate updated successfully' })
	@ApiResponse({
		status: 400,
		description: 'Bad request - validation failed',
	})
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async setDriverRate(
		@Param('id', ParseIntPipe) id: number,
		@Param('driverExternalId') driverExternalId: string,
		@Body() dto: SetDriverRateDto,
	) {
		const result = await this.offersService.setDriverRate(
			id,
			driverExternalId,
			dto,
		);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			'driver_rate_updated',
			{ affectedExternalIds: [driverExternalId] },
		);
		return result;
	}

	@Patch(':id/drivers/:driverExternalId/extend-time')
	@ApiOperation({
		summary: 'Extend driver action time for an offer',
		description:
			'Updates rate_offers row for the given offer and driver: adds extendTimeMinutes to the later of current action_time or current time, both as Unix seconds.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({
		name: 'driverExternalId',
		description: 'Driver externalId (User.externalId)',
	})
	@ApiBody({ type: ExtendDriverTimeDto })
	@ApiResponse({
		status: 200,
		description: 'Action time extended successfully',
	})
	@ApiResponse({
		status: 400,
		description: 'Bad request - validation failed',
	})
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async extendDriverTime(
		@Param('id', ParseIntPipe) id: number,
		@Param('driverExternalId') driverExternalId: string,
		@Body() dto: ExtendDriverTimeDto,
	) {
		const result = await this.offersService.extendDriverTime(
			id,
			driverExternalId,
			dto,
		);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			'bid_time_extended',
			{ affectedExternalIds: [driverExternalId] },
		);
		return result;
	}
}
