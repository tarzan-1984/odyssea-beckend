import {
	BadRequestException,
	Body,
	Controller,
	Get,
	Logger,
	Param,
	Post,
	Query,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';
import { SkipAuth } from '../auth/decorators/skip-auth.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsWebSocketService } from '../notifications/notifications-websocket.service';
import { PrismaService } from '../prisma/prisma.service';
import { GetDriverLoadsDto } from './dto/get-driver-loads.dto';
import { TmsDriverApplicationService } from './tms-driver-application.service';
import { TmsDriverLoadsService } from './tms-driver-loads.service';
import {
	TmsLoadDetailsResponse,
	TmsLoadDetailsService,
} from './tms-load-details.service';

@ApiTags('TMS')
@ApiBearerAuth()
@Controller('tms')
@UseGuards(JwtAuthGuard)
export class TmsController {
	private readonly logger = new Logger(TmsController.name);

	constructor(
		private readonly tmsDriverLoadsService: TmsDriverLoadsService,
		private readonly tmsDriverApplicationService: TmsDriverApplicationService,
		private readonly tmsLoadDetailsService: TmsLoadDetailsService,
		private readonly prisma: PrismaService,
		private readonly notificationsWebSocketService: NotificationsWebSocketService,
		private readonly notificationsService: NotificationsService,
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

	@Get('load/:loadId')
	@SkipAuth()
	@ApiOperation({
		summary: 'Proxy: TMS load details',
		description:
			'Public proxy for GET https://www.endurance-tms.com/wp-json/tms/v1/load/:loadId.',
	})
	@ApiResponse({ status: 200, description: 'TMS load details response' })
	async getLoadDetails(@Param('loadId') loadId: string) {
		const loadDetails = await this.tmsLoadDetailsService.fetchLoadDetails(loadId);
		return this.attachLoadDriversAndTracking(loadId, loadDetails);
	}

	private async attachLoadDriversAndTracking(
		loadId: string,
		loadDetails: TmsLoadDetailsResponse | null,
	) {
		if (!loadDetails?.data) {
			return loadDetails;
		}

		const metaData = loadDetails.data.meta_data;
		const driverExternalIds = [
			metaData?.attached_driver,
			metaData?.attached_second_driver,
			metaData?.attached_third_driver,
		]
			.map((value) => String(value ?? '').trim())
			.filter(Boolean);

		const uniqueDriverExternalIds = Array.from(new Set(driverExternalIds));
		const [drivers, trackingPoints] = await Promise.all([
			uniqueDriverExternalIds.length > 0
				? this.prisma.user.findMany({
						where: {
							externalId: {
								in: uniqueDriverExternalIds,
							},
						},
						select: {
							id: true,
							externalId: true,
							email: true,
							firstName: true,
							lastName: true,
							phone: true,
							profilePhoto: true,
							role: true,
							status: true,
							driverStatus: true,
							city: true,
							state: true,
							zip: true,
							latitude: true,
							longitude: true,
							lastLocationUpdateAt: true,
							isTracking: true,
							trackingLoadId: true,
						},
					})
				: Promise.resolve([]),
			this.prisma.driverTracking.findMany({
				where: { loadId },
				select: {
					externalDriverId: true,
					latitude: true,
					longitude: true,
					createdAt: true,
					updatedAt: true,
				},
				orderBy: { createdAt: 'asc' },
			}),
		]);

		const driversByExternalId = new Map(
			drivers.map((driver) => [driver.externalId, driver]),
		);

		return {
			...loadDetails,
			data: {
				...loadDetails.data,
				drivers: uniqueDriverExternalIds
					.map((externalId) => driversByExternalId.get(externalId))
					.filter((driver): driver is (typeof drivers)[number] => Boolean(driver)),
				trackingPoints,
			},
		};
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
			'Receives load status updates from TMS. For loaded-enroute, marks the ACTIVE driver as loaded_enroute and starts tracking for the provided load_id.',
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
		});

		const normalizedLoadStatus = loadStatus.toLowerCase().replace(/-/g, '_');
		if (
			normalizedLoadStatus !== 'loaded_enroute' &&
			normalizedLoadStatus !== 'delivered'
		) {
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
			},
		});

		if (!driver) {
			this.logger.warn(
				`TMS load status webhook: driver not found externalId=${driverId}`,
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
				`TMS load status webhook: driver not eligible externalId=${driverId} role=${driver.role} status=${driver.status}`,
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
		if (normalizedLoadStatus === 'delivered') {
			const oldDriverStatusNormalized = oldDriverStatus
				?.trim()
				.toLowerCase()
				.replace(/-/g, '_');
			const shouldResetDriverStatus =
				oldDriverStatusNormalized === 'loaded_enroute';

			const [trackingCleanup, updatedDriver] = await this.prisma.$transaction([
				this.prisma.driverTracking.deleteMany({
					where: { loadId },
				}),
				this.prisma.user.update({
					where: { id: driver.id },
					data: {
						isTracking: false,
						trackingLoadId: null,
						...(shouldResetDriverStatus
							? {
									driverStatus: 'available',
									isAutoupdate: true,
								}
							: {}),
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
					},
				}),
			]);

			this.logger.log(
				`TMS load status webhook: delivered load_id=${loadId} driver_id=${driverId} deletedTrackingPoints=${trackingCleanup.count} resetDriverStatus=${shouldResetDriverStatus}`,
			);

			await this.notificationsWebSocketService.sendDriverProfileSync(driver.id, {
				driverStatus: updatedDriver.driverStatus ?? null,
				zip: updatedDriver.zip ?? null,
				city: updatedDriver.city ?? null,
				state: updatedDriver.state ?? null,
				location: updatedDriver.location ?? null,
				statusDate: updatedDriver.statusDate ?? null,
				isAutoupdate: updatedDriver.isAutoupdate ?? false,
			});

			if (oldDriverStatus !== updatedDriver.driverStatus) {
				await this.notificationsWebSocketService.sendDriverStatusUpdate(
					driver.id,
					{
						driverStatus: updatedDriver.driverStatus ?? null,
						isAutoupdate: updatedDriver.isAutoupdate ?? false,
					},
				);
			}

			return {
				success: true,
				data: {
					loadId,
					driverId,
					loadStatus,
					action: 'driver_tracking_stopped',
					driverStatus: updatedDriver.driverStatus,
					isAutoupdate: updatedDriver.isAutoupdate,
					isTracking: updatedDriver.isTracking,
					trackingLoadId: updatedDriver.trackingLoadId,
					deletedTrackingPoints: trackingCleanup.count,
					driverStatusReset: shouldResetDriverStatus,
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
				`TMS load status webhook: cleaned offers for load_id=${loadId} offers=${offerCleanup.offers} rateOffers=${offerCleanup.rateOffers}`,
			);
		}

		await this.notificationsWebSocketService.sendDriverProfileSync(driver.id, {
			driverStatus: updatedDriver.driverStatus ?? null,
			zip: updatedDriver.zip ?? null,
			city: updatedDriver.city ?? null,
			state: updatedDriver.state ?? null,
			location: updatedDriver.location ?? null,
			statusDate: updatedDriver.statusDate ?? null,
			isAutoupdate: updatedDriver.isAutoupdate ?? false,
		});

		if (oldDriverStatus !== updatedDriver.driverStatus) {
			await this.notificationsWebSocketService.sendDriverStatusUpdate(driver.id, {
				driverStatus: updatedDriver.driverStatus ?? null,
				isAutoupdate: updatedDriver.isAutoupdate ?? false,
			});

			this.notificationsService
				.sendDriverStatusChangedPush({
					userId: driver.id,
					driverStatus: updatedDriver.driverStatus ?? null,
				})
				.catch(() => {});
		}

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
			},
		};
	}
}

