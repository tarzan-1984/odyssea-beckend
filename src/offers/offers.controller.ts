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
	ForbiddenException,
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
import { canModifyOffers } from '../common/user-role-access';
import { AuthenticatedRequest } from '../types/request.types';
import { OffersService } from './offers.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';
import { GetDraftLoadsDto } from './dto/get-draft-loads.dto';
import { AddDriversToOfferDto } from './dto/add-drivers-to-offer.dto';
import { SetDriverRateDto } from './dto/set-driver-rate.dto';
import { ExtendDriverTimeDto } from './dto/extend-driver-time.dto';
import { OffersRealtimeService } from './offers-realtime.service';
import { OfferPostCreateBackgroundService } from './offer-post-create-background.service';
import {
	getOfferTitleFromRoute,
	getRouteEndpoints,
} from './offer-route.util';

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
	constructor(
		private readonly offersService: OffersService,
		private readonly notificationsService: NotificationsService,
		private readonly offersRealtimeService: OffersRealtimeService,
		private readonly offerPostCreateBackgroundService: OfferPostCreateBackgroundService,
	) {}

	private ensureCanModifyOffers(role: AuthenticatedRequest['user']['role']): void {
		if (!canModifyOffers(role)) {
			throw new ForbiddenException('Guests cannot modify offers');
		}
	}

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

	@Get('driver-participation-count')
	@ApiOperation({
		summary: 'Get driver participation count',
		description:
			'Returns count of offers where the driver has an open bid (rate set, rate row not is_selected). Does not count offers already assigned (isDriverSelected). Limit is configured in app_settings (max_driver_open_offer_participations).',
	})
	@ApiResponse({ status: 200, description: 'Participation count' })
	async getDriverParticipationCount(
		@Request() req: { user: { id: string } },
	) {
		return this.offersService.getDriverParticipationCount(req.user?.id ?? '');
	}

	@Get('driver/draft-loads')
	@ApiOperation({
		summary: 'Driver draft loads (TMS) with offer title, rate, loaded miles',
		description:
			'Drivers only. Uses the signed-in user’s TMS external id. Backend calls TMS drafts API then enriches each row from local offers / rate_offers.',
	})
	@ApiResponse({ status: 200, description: 'Draft load cards data' })
	@ApiResponse({ status: 403, description: 'Not a driver' })
	@ApiResponse({ status: 502, description: 'TMS unavailable' })
	async getDriverDraftLoads(
		@Request() req: { user: { id: string; role: string } },
		@Query() query: GetDraftLoadsDto,
	) {
		return this.offersService.getDriverDraftLoadsForCurrentUser(
			req.user?.id ?? '',
			req.user?.role ?? '',
			query,
		);
	}

	@Get('draft-loads')
	@ApiOperation({
		summary: 'Staff draft loads (TMS) with offer title, rate, loaded miles',
		description:
			'Non-drivers only. Uses the signed-in user’s externalId as TMS `user_id`. Calls GET /loads/drafts (project=odysseia, is_flt=false, per_page=100) then enriches each row from local offers / rate_offers.',
	})
	@ApiResponse({ status: 200, description: 'Draft load cards data' })
	@ApiResponse({ status: 403, description: 'Drivers must use /offers/driver/draft-loads' })
	@ApiResponse({ status: 502, description: 'TMS unavailable' })
	async getStaffDraftLoads(
		@Request() req: { user: { id: string; role: string } },
		@Query() query: GetDraftLoadsDto,
	) {
		return this.offersService.getStaffDraftLoadsForCurrentUser(
			req.user?.id ?? '',
			req.user?.role ?? '',
			query,
		);
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
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const offer = await this.offersService.create(dto);
		await this.offersRealtimeService.emitOfferUpdated(offer.id, 'offer_created', {
			affectedExternalIds: dto.driverIds ?? [],
			requestingUserId: req.user.id,
		});

		const driverExternalIds = (dto.driverIds ?? [])
			.map((id) => String(id ?? '').trim())
			.filter(Boolean);
		if (driverExternalIds.length > 0) {
			const { pickUp, delivery } = getRouteEndpoints(dto.route);
			this.offerPostCreateBackgroundService.enqueue({
				offerId: offer.id,
				creatorUserId: req.user.id,
				driverExternalIds,
				pickUp,
				delivery,
				offerTitle: getOfferTitleFromRoute(dto.route, offer.id),
			});
		}

		return offer;
	}

	@Patch(':id')
	@ApiOperation({
		summary: 'Update an offer',
		description:
			'Updates offer fields (route, loaded miles, weight, etc.) and recalculates total miles for linked drivers.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiBody({ type: CreateOfferDto })
	@ApiResponse({ status: 200, description: 'Offer updated successfully' })
	@ApiResponse({ status: 400, description: 'Bad request - validation failed' })
	@ApiResponse({ status: 404, description: 'Offer not found' })
	async update(
		@Param('id', ParseIntPipe) id: number,
		@Body() dto: CreateOfferDto,
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.update(id, dto);
		await this.offersRealtimeService.emitOfferUpdated(id, 'offer_updated', {
			affectedExternalIds: result.notifiedDriverExternalIds,
			requestingUserId: req.user.id,
		});

		if (result.notifiedDriverExternalIds.length > 0) {
			const driverUsers = await this.offersService.findDriverUsersByExternalIds(
				result.notifiedDriverExternalIds,
			);
			await Promise.all(
				driverUsers.map((user) =>
					this.notificationsService
						.createOfferUpdatedNotification({
							userId: user.id,
							offerId: id,
							offerTitle: result.offerTitle,
							pickUp: result.pickUp,
							delivery: result.delivery,
						})
						.catch((err) =>
							console.error(
								`Failed to send offer_updated notification to ${user.id}:`,
								err,
							),
						),
				),
			);
		}

		return result.offer;
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
	async deactivateOffer(
		@Param('id', ParseIntPipe) id: number,
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.deactivateOffer(id);
		await this.offersRealtimeService.emitOfferUpdated(id, 'offer_deactivated', {
			requestingUserId: req.user?.id,
		});
		return result;
	}

	@Patch(':id/drivers/:driverExternalId')
	@ApiOperation({
		summary: 'Deactivate driver in offer',
		description:
			'Sets active=false for the rate_offer row (offer_id + driver_id by externalId). Driver remains in the list for administrators, but becomes inactive.',
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
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.removeDriverFromOffer(
			id,
			driverExternalId,
		);
		await this.offersRealtimeService.emitOfferUpdated(id, 'driver_removed', {
			affectedExternalIds: [driverExternalId],
			requestingUserId: req.user?.id,
		});
		const ctx = await this.offersService.getOfferNotificationContext(id, driverExternalId);
		if (ctx) {
			const payload = { offerId: id, offerTitle: ctx.offerTitle, driverName: ctx.driverName, driverAvatar: ctx.driverAvatar };
			await Promise.all(
				ctx.recipientUserIds.map((userId) =>
					this.notificationsService
						.createOfferRefusedNotification({ userId, ...payload })
						.catch((err) => console.error(`Failed to send offer_declined notification to ${userId}:`, err)),
				),
			);
		}
		return result;
	}

	@Patch(':id/drivers/:driverExternalId/return')
	@ApiOperation({
		summary: 'Return driver to offer',
		description:
			'Sets active=true for the rate_offer row (offer_id + driver_id by externalId). Driver appears again as active in the offer drivers list.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({
		name: 'driverExternalId',
		description: 'Driver externalId (User.externalId)',
	})
	@ApiResponse({
		status: 200,
		description: 'Driver returned successfully',
	})
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async returnDriverToOffer(
		@Param('id', ParseIntPipe) id: number,
		@Param('driverExternalId') driverExternalId: string,
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.returnDriverToOffer(
			id,
			driverExternalId,
		);
		await this.offersRealtimeService.emitOfferUpdated(id, 'driver_returned', {
			affectedExternalIds: [driverExternalId],
			requestingUserId: req.user?.id,
		});
		return result;
	}

	@Patch(':id/drivers/:driverExternalId/select')
	@ApiOperation({
		summary: 'Select driver for offer',
		description:
			'Marks the specified driver as selected for the offer, deactivates the other offer drivers, and marks the offer as having a selected driver.',
	})
	@ApiParam({ name: 'id', description: 'Offer id' })
	@ApiParam({
		name: 'driverExternalId',
		description: 'Driver externalId (User.externalId)',
	})
	@ApiResponse({
		status: 200,
		description: 'Driver selected successfully',
	})
	@ApiResponse({ status: 404, description: 'Offer or rate_offer not found' })
	async selectDriverForOffer(
		@Param('id', ParseIntPipe) id: number,
		@Param('driverExternalId') driverExternalId: string,
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.selectDriverForOffer(
			id,
			driverExternalId,
		);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			'driver_selected',
			{
				affectedExternalIds: result.affectedDriverExternalIds,
				requestingUserId: req.user?.id,
			},
		);
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
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.addDriversToOffer(id, dto);
		if (
			result.addedDriverExternalIds &&
			result.addedDriverExternalIds.length > 0 &&
			'route' in result &&
			result.route
		) {
			const { pickUp, delivery } = getRouteEndpoints(result.route);
			this.offerPostCreateBackgroundService.enqueue({
				offerId: id,
				creatorUserId: req.user.id,
				driverExternalIds: result.addedDriverExternalIds,
				pickUp,
				delivery,
				offerTitle: getOfferTitleFromRoute(result.route, id),
			});
		}
		await this.offersRealtimeService.emitOfferUpdated(id, 'drivers_added', {
			affectedExternalIds: result.addedDriverExternalIds ?? [],
			requestingUserId: req.user?.id,
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
		@Request() req: { user: { id: string } },
	) {
		const result = await this.offersService.setDriverRate(
			id,
			driverExternalId,
			dto,
		);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			result.is_rate_edit ? 'driver_rate_edited' : 'driver_rate_updated',
			{
				affectedExternalIds: [driverExternalId],
				requestingUserId: req.user?.id,
			},
		);
		const ctx = await this.offersService.getOfferNotificationContext(id, driverExternalId);
		if (ctx) {
			const payload = { offerId: id, offerTitle: ctx.offerTitle, driverName: ctx.driverName, driverAvatar: ctx.driverAvatar };
			await Promise.all(
				ctx.recipientUserIds.map((userId) =>
					this.notificationsService
						.createOfferBidNotification({ userId, ...payload })
						.catch((err) => console.error(`Failed to send offer_bid notification to ${userId}:`, err)),
				),
			);
		}
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
		@Request() req: AuthenticatedRequest,
	) {
		this.ensureCanModifyOffers(req.user.role);
		const result = await this.offersService.extendDriverTime(
			id,
			driverExternalId,
			dto,
		);
		await this.offersRealtimeService.emitOfferUpdated(
			id,
			'bid_time_extended',
			{
				affectedExternalIds: [driverExternalId],
				requestingUserId: req.user?.id,
			},
		);
		const ctx = await this.offersService.getOfferNotificationContext(id, driverExternalId);
		if (ctx) {
			const payload = { offerId: id, offerTitle: ctx.offerTitle, driverName: ctx.driverName, driverAvatar: ctx.driverAvatar };
			await Promise.all(
				ctx.recipientUserIds.map((userId) =>
					this.notificationsService
						.createOfferExtendTimeNotification({ userId, ...payload })
						.catch((err) => console.error(`Failed to send offer_extended notification to ${userId}:`, err)),
				),
			);
		}
		return result;
	}
}
