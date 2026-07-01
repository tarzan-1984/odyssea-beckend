import {
	BadRequestException,
	Body,
	Controller,
	DefaultValuePipe,
	Delete,
	ForbiddenException,
	Get,
	HttpCode,
	Logger,
	Param,
	Patch,
	Post,
	Query,
	Request,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus, DriverLogSource } from '@prisma/client';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/request.types';
import { GetDriverLoadsDto } from './dto/get-driver-loads.dto';
import { TmsLoadEnrichmentDto } from './dto/tms-load-enrichment.dto';
import { UpdateLoadTrackingPointDto } from './dto/update-load-tracking-point.dto';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';
import { ActivateDriverApplicationBackfillDto } from './dto/activate-driver-application-backfill.dto';
import { TmsLoadUpdateWebhookDto } from './dto/tms-load-update-webhook.dto';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverApplicationBackfillBackgroundService } from './tms-driver-application-backfill-background.service';
import { TmsDriverLoadsService } from './tms-driver-loads.service';
import {
	TmsLoadDetailsResponse,
	TmsLoadDetailsService,
} from './tms-load-details.service';
import { TmsLoadTrackingService } from './tms-load-tracking.service';
import { DriverLogService } from '../users/driver-log.service';
import { buildTmsLoadStatusDriverChanges } from '../users/utils/driver-change-log.util';
import { sanitizeMobileLoadDetailsResponse } from './tms-load-meta-sanitize.util';
import { LoadChatTmsSyncService } from '../chats/load-chat-tms-sync.service';
/** Grep this in logs (e.g. Render) to find TMS load status webhook calls only. */
const TMS_LOAD_STATUS_WEBHOOK_MARKER = 'TMS_LOAD_STATUS_WEBHOOK';
/** Grep this in logs to find TMS load data update webhook calls only. */
const TMS_LOAD_UPDATE_WEBHOOK_MARKER = 'TMS_LOAD_UPDATE_WEBHOOK';

/** Load ended — same cleanup as delivered (stop tracking, deliveryAt, route geocode). */
const TMS_LOAD_TERMINAL_STATUSES = new Set([
	'delivered',
	'tonu',
	'cancelled',
	'canceled',
]);

/** Load active again — clear deliveryAt / isLoadArchived on LOAD chats. */
const TMS_LOAD_REACTIVATION_STATUSES = new Set([
	'waiting_on_pu_date',
	'at_pu',
	'loaded_enroute',
	'at_del',
]);

function isTmsLoadTerminalStatus(normalizedLoadStatus: string): boolean {
	return TMS_LOAD_TERMINAL_STATUSES.has(normalizedLoadStatus);
}

function isTmsLoadReactivationStatus(normalizedLoadStatus: string): boolean {
	return TMS_LOAD_REACTIVATION_STATUSES.has(normalizedLoadStatus);
}

function isTmsLoadHandledStatus(normalizedLoadStatus: string): boolean {
	return (
		isTmsLoadTerminalStatus(normalizedLoadStatus) ||
		isTmsLoadReactivationStatus(normalizedLoadStatus)
	);
}

const LOAD_TRACKING_HISTORY_EDIT_ROLES = new Set([
	'EXPEDITE_MANAGER',
	'ADMINISTRATOR',
	'MODERATOR',
	'TRACKING_TL',
]);

@ApiTags('TMS')
@ApiBearerAuth()
@Controller('tms')
@UseGuards(JwtAuthGuard)
export class TmsController {
	private readonly logger = new Logger(TmsController.name);

	constructor(
		private readonly tmsDriverLoadsService: TmsDriverLoadsService,
		private readonly tmsDriverApplicationService: TmsDriverApplicationService,
		private readonly tmsDriverApplicationBackfillBackgroundService: TmsDriverApplicationBackfillBackgroundService,
		private readonly tmsLoadDetailsService: TmsLoadDetailsService,
		private readonly tmsLoadTrackingService: TmsLoadTrackingService,
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
		private readonly notificationsService: NotificationsService,
		private readonly driverLogService: DriverLogService,
		private readonly loadChatTmsSyncService: LoadChatTmsSyncService,
	) {}

	@Get('driver/loads')
	@ApiOperation({
		summary: 'Proxy: TMS driver loads list',
		description:
			'Proxies GET https://www.endurance-tms.com/wp-json/tms/v1/driver/loads. All query params are provided by the mobile app and forwarded as-is (whitelisted).',
	})
	@ApiResponse({ status: 200, description: 'TMS response (proxied)' })
	async getDriverLoads(
		@Request() req: AuthenticatedRequest,
		@Query() query: GetDriverLoadsDto,
	) {
		const forDriver = req.user?.role === UserRole.DRIVER;
		return this.tmsDriverLoadsService.fetchDriverLoads(query, { forDriver });
	}

	@Get('load/:loadId')
	@ApiOperation({
		summary: 'Proxy: TMS load details',
		description:
			'Proxies GET TMS load/:loadId and attaches DB drivers + tracking history. Requires authentication.',
	})
	@ApiResponse({ status: 200, description: 'TMS load details response' })
	async getLoadDetails(
		@Request() req: AuthenticatedRequest,
		@Param('loadId') loadId: string,
	) {
		const loadDetails = await this.tmsLoadDetailsService.fetchLoadDetails(loadId);
		const enriched = await this.attachLoadDriversAndTracking(loadId, loadDetails);
		return sanitizeMobileLoadDetailsResponse(enriched, {
			forDriver: req.user?.role === UserRole.DRIVER,
		});
	}

	@Post('load/:loadId/enrichment')
	@ApiOperation({
		summary: 'Load page enrichment from DB',
		description:
			'Returns drivers, tracking history, and route geocode for a load. TMS load body is fetched separately (e.g. via Next.js).',
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
			body.shippers,
		);
	}

	@Delete('load/:loadId/tracking/:pointId')
	@ApiOperation({
		summary: 'Delete one driver tracking history point for a load',
	})
	@ApiResponse({ status: 200, description: 'Tracking point deleted' })
	async deleteLoadTrackingPoint(
		@Request() req: AuthenticatedRequest,
		@Param('loadId') loadId: string,
		@Param('pointId') pointId: string,
	) {
		this.assertCanEditLoadTrackingHistory(req);
		const cleanLoadId = loadId.trim();
		const cleanPointId = pointId.trim();

		if (!cleanLoadId) {
			throw new BadRequestException('loadId is required');
		}
		if (!cleanPointId) {
			throw new BadRequestException('pointId is required');
		}

		const result = await this.prisma.driverTracking.deleteMany({
			where: {
				id: cleanPointId,
				loadId: cleanLoadId,
			},
		});

		if (result.count === 0) {
			throw new BadRequestException('Tracking point not found');
		}

		return {
			success: true,
			data: {
				id: cleanPointId,
				loadId: cleanLoadId,
				deleted: true,
			},
		};
	}

	@Patch('load/:loadId/tracking/:pointId')
	@ApiOperation({
		summary: 'Update coordinates of one driver tracking history point for a load',
	})
	@ApiResponse({ status: 200, description: 'Tracking point updated' })
	async updateLoadTrackingPoint(
		@Request() req: AuthenticatedRequest,
		@Param('loadId') loadId: string,
		@Param('pointId') pointId: string,
		@Body() body: UpdateLoadTrackingPointDto,
	) {
		this.assertCanEditLoadTrackingHistory(req);
		const cleanLoadId = loadId.trim();
		const cleanPointId = pointId.trim();

		if (!cleanLoadId) {
			throw new BadRequestException('loadId is required');
		}
		if (!cleanPointId) {
			throw new BadRequestException('pointId is required');
		}

		const lat = Number(body.latitude);
		const lng = Number(body.longitude);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
			throw new BadRequestException('latitude and longitude must be finite numbers');
		}

		const existing = await this.prisma.driverTracking.findFirst({
			where: {
				id: cleanPointId,
				loadId: cleanLoadId,
			},
			select: { id: true },
		});

		if (!existing) {
			throw new BadRequestException('Tracking point not found');
		}

		const updated = await this.prisma.driverTracking.update({
			where: { id: cleanPointId },
			data: {
				latitude: lat,
				longitude: lng,
				updatedAt: nowInNewYorkAsNaiveDate(),
			},
			select: {
				id: true,
				loadId: true,
				externalDriverId: true,
				latitude: true,
				longitude: true,
				placeLabel: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		return {
			success: true,
			data: updated,
		};
	}

	private assertCanEditLoadTrackingHistory(req: AuthenticatedRequest): void {
		const role = String(req.user?.role ?? '')
			.trim()
			.toUpperCase();
		if (!LOAD_TRACKING_HISTORY_EDIT_ROLES.has(role)) {
			throw new ForbiddenException(
				'You do not have permission to edit load tracking history',
			);
		}
	}

	private async attachLoadDriversAndTracking(
		loadId: string,
		loadDetails: TmsLoadDetailsResponse | null,
	) {
		if (!loadDetails?.data) {
			return loadDetails;
		}

		const enrichment = await this.tmsLoadTrackingService.buildLoadEnrichment(
			loadId,
			loadDetails.data.meta_data ?? {},
			Array.isArray(loadDetails.data.shippers)
				? loadDetails.data.shippers
				: undefined,
		);

		return {
			...loadDetails,
			data: {
				...loadDetails.data,
				...enrichment,
			},
		};
	}

	@ApiQuery({
		name: 'batchSize',
		required: false,
		description: 'Rows per request (1–200). Default 50.',
		example: 50,
	})
	@ApiQuery({
		name: 'skip',
		required: false,
		description: 'Offset; use nextSkip from the previous response.',
		example: 0,
	})
	@Post('driver/application/activate-backfill-batch')
	@SkipAuth()
	@HttpCode(200)
	@ApiOperation({
		summary:
			'Sync one batch: TMS driver/application/activate for up to N drivers (manual pagination)',
		description:
			'Loads ACTIVE drivers with last_active_app and externalId, ordered by lastActiveApp asc. ' +
			'Processes one page of `batchSize` (default 50). Prefer POST /driver/application/activate-backfill for full background run.',
	})
	@ApiResponse({
		status: 200,
		description: 'Batch counters and nextSkip when more rows remain',
	})
	async activateBackfillBatch(
		@Query('batchSize') batchSizeRaw?: string,
		@Query('skip') skipRaw?: string,
	) {
		const batchSizeParsed = parseInt(batchSizeRaw ?? '', 10);
		const skipParsed = parseInt(skipRaw ?? '', 10);
		return this.tmsDriverApplicationService.backfillActivatedDriversFromLastActiveApp({
			batchSize: Number.isFinite(batchSizeParsed) ? batchSizeParsed : undefined,
			skip: Number.isFinite(skipParsed) ? skipParsed : undefined,
		});
	}

	@Post('driver/application/activate-backfill')
	@SkipAuth()
	@HttpCode(200)
	@ApiOperation({
		summary:
			'Start background backfill: notify TMS for all matching drivers in batches of 50',
		description: `Same filters as the batch endpoint, but runs in the background like POST /v1/users/import-users.
Body is optional: \`{ "batchSize": 50 }\` (1–200, default 50).
Poll GET /v1/tms/driver/application/activate-backfill-status/{jobId} until isComplete is true.`,
	})
	@ApiResponse({
		status: 200,
		description: 'jobId and message with status URL',
		schema: {
			type: 'object',
			properties: {
				jobId: { type: 'string' },
				message: { type: 'string' },
			},
		},
	})
	async startActivateBackfill(
		@Body(new DefaultValuePipe({})) body: ActivateDriverApplicationBackfillDto,
	) {
		return this.tmsDriverApplicationBackfillBackgroundService.startBackfill(
			body.batchSize,
		);
	}

	@Get('driver/application/activate-backfill-status/:jobId')
	@SkipAuth()
	@ApiOperation({
		summary: 'Get driver application activate backfill job status',
		description:
			'Progress, totals, and failed sample (capped). Same idea as GET /v1/users/import-users-status/:jobId.',
	})
	@ApiResponse({ status: 200, description: 'Job status' })
	@ApiResponse({ status: 404, description: 'Unknown jobId' })
	async getActivateBackfillStatus(@Param('jobId') jobId: string) {
		return this.tmsDriverApplicationBackfillBackgroundService.getStatus(jobId);
	}

	@Post('load/update')
	@SkipAuth()
	@HttpCode(200)
	@ApiOperation({
		summary: 'Open TMS webhook: load data changed',
		description:
			'Receives load data updates from TMS. Broadcasts tmsLoadUpdated via WebSocket so mobile clients refetch the loads list and refresh the open load detail screen.',
	})
	@ApiResponse({
		status: 200,
		description: 'Webhook accepted and broadcast to connected clients',
	})
	async receiveLoadDataUpdated(@Body() body: TmsLoadUpdateWebhookDto) {
		const loadId = body.load_id.trim();
		const project = body.project?.trim() || undefined;
		const isFlt = body.is_flt;

		this.logger.log(
			`======== ${TMS_LOAD_UPDATE_WEBHOOK_MARKER} ======== EVENT=load_data_update load_id=${loadId} project=${project ?? 'n/a'} is_flt=${String(isFlt)}`,
		);

		await this.notificationsWebSocketService.broadcastTmsLoadUpdated({
			loadId,
			project,
			isFlt,
		});

		return {
			success: true,
			data: {
				loadId,
				project,
				is_flt: isFlt,
				action: 'broadcast',
			},
		};
	}

	@Post('load/status')
	@SkipAuth()
	@ApiOperation({
		summary: 'Open TMS webhook: load status changed',
		description:
			'Receives load status updates from TMS. For loaded-enroute, marks the ACTIVE driver as loaded_enroute and starts tracking for the provided load_id. For delivered, tonu, cancelled (or canceled), stops tracking and clears trackingLoadId, sets chat_rooms.deliveryAt (UTC) on LOAD rooms for this load_id; keeps driver_tracking history rows for this load; does not change driverStatus or isAutoupdate (manual / other flows only). For waiting-on-pu-date, at-pu, loaded-enroute, at-del, clears chat_rooms.deliveryAt and is_load_archived on LOAD rooms and emits chatRoomUpdated so clients move the chat back to the active list.',
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
		},
	) {
		const loadId =
			body?.load_id != null ? String(body.load_id).trim() : '';
		const driverId =
			body?.driver_id != null ? String(body.driver_id).trim() : '';
		const loadStatus =
			typeof body?.load_status === 'string' ? body.load_status.trim() : '';

		if (!loadId) {
			this.logger.warn(
				`======== ${TMS_LOAD_STATUS_WEBHOOK_MARKER} ======== INVALID_PAYLOAD missing_field=load_id`,
			);
			throw new BadRequestException('load_id is required');
		}
		if (!driverId) {
			this.logger.warn(
				`======== ${TMS_LOAD_STATUS_WEBHOOK_MARKER} ======== INVALID_PAYLOAD missing_field=driver_id load_id=${loadId}`,
			);
			throw new BadRequestException('driver_id is required');
		}
		if (!loadStatus) {
			this.logger.warn(
				`======== ${TMS_LOAD_STATUS_WEBHOOK_MARKER} ======== INVALID_PAYLOAD missing_field=load_status load_id=${loadId} driver_id=${driverId}`,
			);
			throw new BadRequestException('load_status is required');
		}

		const normalizedLoadStatus = loadStatus.toLowerCase().replace(/-/g, '_');
		this.logger.log(
			`======== ${TMS_LOAD_STATUS_WEBHOOK_MARKER} ======== EVENT=load_status_update load_id=${loadId} driver_id=${driverId} load_status_raw=${loadStatus} normalized=${normalizedLoadStatus}`,
		);

		if (!isTmsLoadHandledStatus(normalizedLoadStatus)) {
			this.logger.log(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=logged_only reason=unsupported_load_status load_id=${loadId} driver_id=${driverId} normalized=${normalizedLoadStatus}`,
			);
			return {
				success: true,
				data: {
					loadId,
					driverId,
					loadStatus,
					action: 'logged_only',
					reason: 'unsupported_load_status',
				},
			};
		}

		const driver = await this.prisma.user.findUnique({
			where: { externalId: driverId },
			select: {
				id: true,
				externalId: true,
				role: true,
				status: true,
				driverStatus: true,
				isTracking: true,
				trackingLoadId: true,
			},
		});

		if (!driver) {
			this.logger.warn(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=skipped reason=driver_not_found load_id=${loadId} driver_id=${driverId}`,
			);
			return {
				success: false,
				data: {
					loadId,
					driverId,
					loadStatus,
					action: 'skipped',
					reason: 'driver_not_found',
				},
			};
		}

		if (driver.role !== UserRole.DRIVER || driver.status !== UserStatus.ACTIVE) {
			this.logger.warn(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=skipped reason=not_active_driver load_id=${loadId} driver_id=${driverId} role=${driver.role} status=${driver.status}`,
			);
			return {
				success: false,
				data: {
					loadId,
					driverId,
					loadStatus,
					action: 'skipped',
					reason: 'driver_not_active_driver',
				},
			};
		}

		const oldDriverStatus = driver.driverStatus ?? null;
		const beforeLoadStatusDriver = {
			driverStatus: driver.driverStatus ?? null,
			isTracking: driver.isTracking,
			trackingLoadId: driver.trackingLoadId,
		};

		if (isTmsLoadTerminalStatus(normalizedLoadStatus)) {
			const deliveredAt = new Date();
			const [geocodeCleanup, updatedDriver, loadChatDeliveryUpdate] =
				await this.prisma.$transaction([
					this.prisma.loadRouteGeocode.deleteMany({
						where: { loadId },
					}),
					this.prisma.user.update({
						where: { id: driver.id },
						data: {
							isTracking: false,
							trackingLoadId: null,
						},
						select: {
							id: true,
							driverStatus: true,
							zip: true,
							city: true,
							state: true,
							location: true,
							statusDate: true,
							isAutoupdate: true,
							isTracking: true,
							trackingLoadId: true,
							deactivateAccount: true,
						},
					}),
					this.prisma.chatRoom.updateMany({
						where: { loadId, type: 'LOAD' },
						data: { deliveryAt: deliveredAt },
					}),
				]);

			this.logger.log(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=driver_tracking_stopped load_status=${normalizedLoadStatus} load_id=${loadId} driver_id=${driverId} driver_tracking_rows_preserved deletedRouteGeocode=${geocodeCleanup.count} load_chat_delivery_at_updated=${loadChatDeliveryUpdate.count} (driver_status_unchanged)`,
			);

			await this.driverLogService.record(
				driverId,
				buildTmsLoadStatusDriverChanges(
					beforeLoadStatusDriver,
					{
						driverStatus: updatedDriver.driverStatus ?? null,
						isTracking: updatedDriver.isTracking,
						trackingLoadId: updatedDriver.trackingLoadId,
					},
					{ loadId, normalizedLoadStatus },
				),
				DriverLogSource.TMS,
			);

			await this.notificationsWebSocketService.sendDriverProfileSync(driver.id, {
				driverStatus: updatedDriver.driverStatus ?? null,
				zip: updatedDriver.zip ?? null,
				city: updatedDriver.city ?? null,
				state: updatedDriver.state ?? null,
				location: updatedDriver.location ?? null,
				statusDate: updatedDriver.statusDate ?? null,
				isAutoupdate: updatedDriver.isAutoupdate ?? false,
				deactivateAccount: updatedDriver.deactivateAccount === true,
			});

			return {
				success: true,
				data: {
					loadId,
					driverId,
					loadStatus,
					normalizedLoadStatus,
					action: 'driver_tracking_stopped',
					driverStatus: updatedDriver.driverStatus,
					isAutoupdate: updatedDriver.isAutoupdate,
					isTracking: updatedDriver.isTracking,
					trackingLoadId: updatedDriver.trackingLoadId,
					driverTrackingPreserved: true,
					deletedRouteGeocodeRows: geocodeCleanup.count,
					deliveryAt: deliveredAt.toISOString(),
					loadChatRoomsUpdated: loadChatDeliveryUpdate.count,
					driverStatusReset: false,
				},
			};
		}

		let loadChatsReactivated = 0;
		if (isTmsLoadReactivationStatus(normalizedLoadStatus)) {
			loadChatsReactivated =
				await this.loadChatTmsSyncService.reactivateLoadChats(loadId);
		}

		if (normalizedLoadStatus !== 'loaded_enroute') {
			this.logger.log(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=load_chat_reactivated load_status=${normalizedLoadStatus} load_id=${loadId} driver_id=${driverId} load_chat_rooms_reactivated=${loadChatsReactivated}`,
			);
			return {
				success: true,
				data: {
					loadId,
					driverId,
					loadStatus,
					normalizedLoadStatus,
					action: 'load_chat_reactivated',
					loadChatRoomsReactivated: loadChatsReactivated,
				},
			};
		}

		const updatedDriver = await this.prisma.user.update({
			where: { id: driver.id },
			data: {
				driverStatus: 'loaded_enroute',
				isTracking: true,
				trackingLoadId: loadId,
			},
			select: {
				id: true,
				driverStatus: true,
				zip: true,
				city: true,
				state: true,
				location: true,
				statusDate: true,
				isAutoupdate: true,
				isTracking: true,
				trackingLoadId: true,
				deactivateAccount: true,
			},
		});

		const offerCleanup = await this.prisma.$transaction(async (tx) => {
			const offers = await tx.offer.findMany({
				where: { loadId },
				select: { id: true },
			});
			const offerIds = offers.map((offer) => offer.id);
			if (offerIds.length === 0) {
				return { offers: 0, rateOffers: 0 };
			}

			const rateOffers = await tx.rateOffer.deleteMany({
				where: { offerId: { in: offerIds } },
			});
			const deletedOffers = await tx.offer.deleteMany({
				where: { id: { in: offerIds } },
			});

			return {
				offers: deletedOffers.count,
				rateOffers: rateOffers.count,
			};
		});

		if (offerCleanup.offers > 0 || offerCleanup.rateOffers > 0) {
			this.logger.log(
				`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- detail=offer_cleanup load_id=${loadId} offers=${offerCleanup.offers} rateOffers=${offerCleanup.rateOffers}`,
			);
		}

		await this.driverLogService.record(
			driverId,
			buildTmsLoadStatusDriverChanges(
				beforeLoadStatusDriver,
				{
					driverStatus: updatedDriver.driverStatus ?? null,
					isTracking: updatedDriver.isTracking,
					trackingLoadId: updatedDriver.trackingLoadId,
				},
				{ loadId, normalizedLoadStatus },
			),
			DriverLogSource.TMS,
		);

		await this.notificationsWebSocketService.sendDriverProfileSync(driver.id, {
			driverStatus: updatedDriver.driverStatus ?? null,
			zip: updatedDriver.zip ?? null,
			city: updatedDriver.city ?? null,
			state: updatedDriver.state ?? null,
			location: updatedDriver.location ?? null,
			statusDate: updatedDriver.statusDate ?? null,
			isAutoupdate: updatedDriver.isAutoupdate ?? false,
			deactivateAccount: updatedDriver.deactivateAccount === true,
		});

		if (oldDriverStatus !== updatedDriver.driverStatus) {
			await this.notificationsWebSocketService.sendDriverStatusUpdate(driver.id, {
				driverStatus: updatedDriver.driverStatus ?? null,
				isAutoupdate: updatedDriver.isAutoupdate ?? false,
				deactivateAccount: updatedDriver.deactivateAccount === true,
			});

			this.notificationsService
				.sendDriverStatusChangedPush({
					userId: driver.id,
					driverStatus: updatedDriver.driverStatus ?? null,
				})
				.catch(() => {});
		}

		this.logger.log(
			`-------- ${TMS_LOAD_STATUS_WEBHOOK_MARKER} -------- OUTCOME=driver_tracking_started load_id=${loadId} driver_id=${driverId} deletedOffers=${offerCleanup.offers} deletedRateOffers=${offerCleanup.rateOffers}`,
		);

		return {
			success: true,
			data: {
				loadId,
				driverId,
				loadStatus,
				action: 'driver_tracking_started',
				driverStatus: updatedDriver.driverStatus,
				isTracking: updatedDriver.isTracking,
				trackingLoadId: updatedDriver.trackingLoadId,
				deletedOffers: offerCleanup.offers,
				deletedRateOffers: offerCleanup.rateOffers,
				loadChatRoomsReactivated: loadChatsReactivated,
			},
		};
	}
}

