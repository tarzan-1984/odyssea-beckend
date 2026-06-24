import {
	BadGatewayException,
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TmsLoadDraftService } from '../tms/tms-load-draft.service';
import {
	TmsDriverDraftLoadsService,
	type TmsDraftLoadRow,
} from '../tms/tms-driver-draft-loads.service';
import { TmsAppDraftLoadsService } from '../tms/tms-app-draft-loads.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
	getOfferTitleFromRoute,
} from './offer-route.util';
import { AxiosError } from '../types/request.types';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';
import { AddDriversToOfferDto } from './dto/add-drivers-to-offer.dto';
import { SetDriverRateDto } from './dto/set-driver-rate.dto';
import { ExtendDriverTimeDto } from './dto/extend-driver-time.dto';
import {
	AMERICA_NEW_YORK_TZ,
	nowInNewYorkAsLocaleString,
} from '../common/utils/ny-wall-clock';

/** TMS externalIds excluded from offer-related push/in-app notifications. */
const ADMIN_EXTERNAL_IDS_EXCLUDED_FROM_OFFER_NOTIFICATIONS = ['1'] as const;
const EXCLUDED_OFFER_NOTIFICATION_EXTERNAL_IDS: readonly string[] =
	ADMIN_EXTERNAL_IDS_EXCLUDED_FROM_OFFER_NOTIFICATIONS;

const NY_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
	timeZone: AMERICA_NEW_YORK_TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
};

const SECONDS_IN_MINUTE = 60;

function getCurrentUnixSeconds(): bigint {
	return BigInt(Math.floor(Date.now() / 1000));
}

function getUnixSecondsPlusMinutes(minutesToAdd: number): bigint {
	return getCurrentUnixSeconds() + BigInt(minutesToAdd * SECONDS_IN_MINUTE);
}

function formatActionTimeUnixToNyString(
	actionTimeUnix: bigint | number | null | undefined,
): string | null {
	if (actionTimeUnix == null) return null;
	const actionTimeNumber = Number(actionTimeUnix);
	if (!Number.isFinite(actionTimeNumber)) return null;

	return new Date(actionTimeNumber * 1000).toLocaleString(
		'en-US',
		NY_FORMAT_OPTS,
	);
}

function extendActionTimeUnix(
	actionTimeUnix: bigint | number | null | undefined,
	minutesToAdd: number,
): bigint {
	const currentUnixSeconds = getCurrentUnixSeconds();
	const existingUnixSeconds =
		actionTimeUnix == null
			? null
			: typeof actionTimeUnix === 'bigint'
				? actionTimeUnix
				: BigInt(actionTimeUnix);
	const baseUnixSeconds =
		existingUnixSeconds != null && existingUnixSeconds > currentUnixSeconds
			? existingUnixSeconds
			: currentUnixSeconds;

	return baseUnixSeconds + BigInt(minutesToAdd * SECONDS_IN_MINUTE);
}

/** Parses TMS offer_id like "OFF-3" or "3" into our numeric offer id. */
function parseOfferNumericIdFromTmsString(offerId: unknown): number | null {
	if (offerId == null) return null;
	if (typeof offerId === 'number' && Number.isInteger(offerId) && offerId > 0) {
		return offerId;
	}
	const s = String(offerId).trim();
	const m = s.match(/(\d+)\s*$/);
	if (!m) return null;
	const n = parseInt(m[1], 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function parseOfferExternalUserIdToTmsUserId(
	externalUserId: string | null | undefined,
): number {
	const trimmed = externalUserId?.trim();
	if (!trimmed) {
		throw new BadRequestException({
			message: 'Cannot accept driver: offer has no external_user_id for TMS',
		});
	}
	if (!/^\d+$/.test(trimmed)) {
		throw new BadRequestException({
			message:
				'Cannot accept driver: external_user_id must be a numeric TMS user id',
		});
	}
	return parseInt(trimmed, 10);
}

function normalizeSpecialRequirementsForTms(json: unknown): string[] {
	if (json == null) return [];
	if (Array.isArray(json)) {
		return json.map((x) => String(x).trim()).filter(Boolean);
	}
	return [];
}

function normalizeRouteForTms(
	route: unknown,
): Array<{ time: string; type: string; location: string }> {
	if (!Array.isArray(route)) return [];
	const out: Array<{ time: string; type: string; location: string }> = [];
	for (const p of route) {
		if (!p || typeof p !== 'object') continue;
		const point = p as Record<string, unknown>;
		const type = String(point.type ?? '').trim();
		const location = String(point.location ?? '').trim();
		const time = String(point.time ?? '').trim();
		if (!type || !location) continue;
		out.push({ type, location, time });
	}
	return out;
}

@Injectable()
export class OffersService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly notificationsService: NotificationsService,
		private readonly tmsLoadDraftService: TmsLoadDraftService,
		private readonly tmsDriverDraftLoadsService: TmsDriverDraftLoadsService,
		private readonly tmsAppDraftLoadsService: TmsAppDraftLoadsService,
		private readonly appSettingsService: AppSettingsService,
	) {}

	async create(dto: CreateOfferDto) {
		// Validate required and hidden fields before creating offer
		const errors: string[] = [];
		if (!dto.externalId?.trim()) {
			errors.push('Creator external ID (externalId / external_user_id) is required');
		}
		const driverIds = Array.isArray(dto.driverIds) ? dto.driverIds : [];
		if (driverIds.length === 0) {
			errors.push('At least one driver (driverIds) is required');
		}
		if (!Array.isArray(dto.route) || dto.route.length === 0) {
			errors.push('Route with at least one point is required');
		}
		const loadedMiles = dto.loadedMiles;
		if (
			loadedMiles == null ||
			(typeof loadedMiles === 'number' && Number.isNaN(loadedMiles))
		) {
			errors.push('Loaded miles is required');
		}
		const weight = dto.weight;
		if (
			weight == null ||
			(typeof weight === 'number' && Number.isNaN(weight))
		) {
			errors.push('Weight is required');
		}
		if (errors.length > 0) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors,
			});
		}

		const nowNy = nowInNewYorkAsLocaleString();
		const driversJson: Prisma.InputJsonValue | undefined =
			driverIds.length > 0 ? driverIds : undefined;
		const specialRequirementsJson: Prisma.InputJsonValue | undefined =
			dto.specialRequirements && dto.specialRequirements.length > 0
				? dto.specialRequirements
				: undefined;
		const routeJson: Prisma.InputJsonValue | undefined =
			dto.route && dto.route.length > 0
				? (dto.route as unknown as Prisma.InputJsonValue)
				: undefined;

		const loadedMilesNum =
			dto.loadedMiles != null && !Number.isNaN(dto.loadedMiles)
				? Number(dto.loadedMiles)
				: null;
		const offeredRateNum =
			dto.offeredRate != null && !Number.isNaN(dto.offeredRate)
				? Number(dto.offeredRate)
				: null;
		const driverEmptyMiles = dto.driverEmptyMiles ?? {};

		const offer = await this.prisma.$transaction(async (tx) => {
			const offer = await tx.offer.create({
				data: {
					externalUserId: dto.externalId.trim(),
					createTime: nowNy,
					updateTime: nowNy,
					loadedMiles: loadedMilesNum,
					offeredRate: offeredRateNum,
					weight: dto.weight ?? null,
					commodity: dto.commodity?.trim() || null,
					specialRequirements:
						specialRequirementsJson ?? Prisma.JsonNull,
					notes: dto.notes?.trim() || null,
					drivers: driversJson ?? Prisma.JsonNull,
					route: routeJson ?? Prisma.JsonNull,
				},
			});

			if (driverIds.length > 0) {
				const rateOfferData = driverIds.map((driverId) => {
					const emptyMilesRaw = driverEmptyMiles[driverId.trim()];
					const emptyMiles =
						emptyMilesRaw != null &&
						!Number.isNaN(Number(emptyMilesRaw))
							? Number(emptyMilesRaw)
							: null;
					const totalMiles =
						loadedMilesNum != null && emptyMiles != null
							? loadedMilesNum + emptyMiles
							: null;
					const rec: {
						offerId: number;
						driverId: string | null;
						rate: number | null;
						emptyMiles?: number;
						totalMiles?: number;
					} = {
						offerId: offer.id,
						driverId: driverId.trim() || null,
						rate: null,
					};
					if (emptyMiles != null) rec.emptyMiles = emptyMiles;
					if (totalMiles != null) rec.totalMiles = totalMiles;
					return rec;
				});
				await tx.rateOffer.createMany({
					data: rateOfferData,
				});
			}

			return offer;
		});

		return offer;
	}

	/**
	 * Set rate, driver_eta and action_time for a specific driver in an offer.
	 * action_time is stored as Unix time in seconds.
	 */
	async setDriverRate(
		offerId: number,
		driverExternalId: string,
		dto: SetDriverRateDto,
	): Promise<{
		offer_id: number;
		driver_id: string;
		rate: number | null;
		driver_eta: string | null;
		action_time: number | null;
		action_time_display: string | null;
	}> {
		const driverId = driverExternalId.trim();
		if (!driverId) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['driverExternalId is required'],
			});
		}

		const rateOffer = await this.prisma.rateOffer.findFirst({
			where: {
				offerId,
				driverId,
				active: true,
			},
		});

		if (!rateOffer) {
			throw new NotFoundException(
				`Active rate_offer not found for offer_id=${offerId} and driver_id=${driverId}`,
			);
		}

		const isFirstBid =
			dto.rate != null && (rateOffer.rate == null || rateOffer.rate === undefined);
		if (isFirstBid) {
			const global = await this.appSettingsService.getGlobal();
			const maxParticipations = Math.max(
				1,
				global.maxDriverOpenOfferParticipations,
			);
			const currentOpen = await this.prisma.rateOffer.count({
				where: {
					driverId,
					rate: { not: null },
					isSelected: false,
					active: true,
					offer: {
						active: true,
						isDriverSelected: false,
					},
				},
			});
			if (currentOpen >= maxParticipations) {
				throw new BadRequestException({
					message: 'Validation failed',
					errors: [
						`Open offer participation limit reached (max ${maxParticipations} active unassigned offers with a bid).`,
					],
				});
			}
		}

		const actionTimeUnix = getUnixSecondsPlusMinutes(dto.rateTimeMinutes);

		const updated = await this.prisma.rateOffer.update({
			where: { id: rateOffer.id },
			data: {
				rate: dto.rate,
				actionTime: actionTimeUnix,
				driverEta: dto.driverEta?.trim() || null,
			},
		});

		return {
			offer_id: offerId,
			driver_id: driverId,
			rate: updated.rate ?? null,
			driver_eta: updated.driverEta ?? null,
			action_time: updated.actionTime != null ? Number(updated.actionTime) : null,
			action_time_display: formatActionTimeUnixToNyString(updated.actionTime),
		};
	}

	async extendDriverTime(
		offerId: number,
		driverExternalId: string,
		dto: ExtendDriverTimeDto,
	): Promise<{
		offer_id: number;
		driver_id: string;
		rate: number | null;
		driver_eta: string | null;
		action_time: number | null;
		action_time_display: string | null;
	}> {
		const driverId = driverExternalId.trim();
		if (!driverId) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['driverExternalId is required'],
			});
		}

		const rateOffer = await this.prisma.rateOffer.findFirst({
			where: {
				offerId,
				driverId,
				active: true,
			},
		});

		if (!rateOffer) {
			throw new NotFoundException(
				`Active rate_offer not found for offer_id=${offerId} and driver_id=${driverId}`,
			);
		}

		const nextActionTimeUnix = extendActionTimeUnix(rateOffer.actionTime ?? null, dto.extendTimeMinutes);

		const updated = await this.prisma.rateOffer.update({
			where: { id: rateOffer.id },
			data: {
				actionTime: nextActionTimeUnix,
			},
		});

		return {
			offer_id: offerId,
			driver_id: driverId,
			rate: updated.rate ?? null,
			driver_eta: updated.driverEta ?? null,
			action_time: updated.actionTime != null ? Number(updated.actionTime) : null,
			action_time_display: formatActionTimeUnixToNyString(updated.actionTime),
		};
	}

	async findOneById(offerId: number, driverIdFilter?: string | null) {
		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: {
				id: true,
				active: true,
				isDriverSelected: true,
				externalUserId: true,
				createTime: true,
				updateTime: true,
				loadedMiles: true,
				offeredRate: true,
				weight: true,
				commodity: true,
				specialRequirements: true,
				notes: true,
				route: true,
				creator: {
					select: {
						externalId: true,
						firstName: true,
						lastName: true,
						role: true,
					},
				},
			},
		});

		if (!offer) {
			throw new NotFoundException(`Offer with id ${offerId} not found`);
		}

		const response = await this.buildPaginatedResponse(
			[offer],
			1,
			1,
			1,
			driverIdFilter != null && String(driverIdFilter).trim() !== ''
				? String(driverIdFilter).trim()
				: undefined,
		);

		return response.results[0];
	}

	/**
	 * Get offers with pagination, optional filters (is_expired, user_id), and drivers from users.
	 * action_time comparison uses current Unix time.
	 */
	/**
	 * Count offers where the driver has an open bid (rate set, not selected on rate row).
	 * Excludes offers that are already assigned (isDriverSelected) — those do not consume the
	 * "max 2 concurrent bids" limit. Only active offers with active rate_offer rows.
	 */
	async getDriverParticipationCount(userId: string): Promise<{ count: number }> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const driverExternalId = user?.externalId?.trim();
		if (!driverExternalId) {
			return { count: 0 };
		}

		const count = await this.prisma.rateOffer.count({
			where: {
				driverId: driverExternalId,
				rate: { not: null },
				isSelected: false,
				active: true,
				offer: {
					active: true,
					isDriverSelected: false,
				},
			},
		});

		return { count };
	}

	/**
	 * TMS draft loads for the signed-in driver, merged with local offer title / rate / miles.
	 */
	async getDriverDraftLoadsForCurrentUser(
		userId: string,
		role: string,
		query: { project: string; page?: number; per_page?: number },
	): Promise<{
		items: Array<{
			tms_draft_id: number;
			date_created: string;
			date_updated: string;
			pick_up_date: string;
			delivery_date: string;
			offer_id: string;
			offer_numeric_id: number | null;
			offer_name: string;
			driver_rate: number | null;
			loaded_miles: number | null;
		}>;
		tms: {
			total: number;
			page: number;
			per_page: number;
			total_pages: number;
			driver_id: number | string;
			project: string;
		};
	}> {
		if (role !== UserRole.DRIVER) {
			throw new ForbiddenException('Only drivers can list draft loads');
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const driverExternalId = user?.externalId?.trim();
		if (!driverExternalId) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['Driver external id is not set'],
			});
		}

		let tmsData: Awaited<
			ReturnType<TmsDriverDraftLoadsService['fetchDraftLoads']>
		>;
		try {
			tmsData = await this.tmsDriverDraftLoadsService.fetchDraftLoads(
				driverExternalId,
				{
					project: query.project,
					page: query.page,
					per_page: query.per_page,
				},
			);
		} catch {
			throw new BadGatewayException(
				'Unable to load draft loads from TMS. Please try again later.',
			);
		}

		const items = await Promise.all(
			tmsData.loads.map((row) =>
				this.enrichDraftLoadRow(row, driverExternalId),
			),
		);

		return {
			items,
			tms: {
				total: tmsData.total,
				page: tmsData.page,
				per_page: tmsData.per_page,
				total_pages: tmsData.total_pages,
				driver_id: tmsData.driver_id,
				project: tmsData.project,
			},
		};
	}

	/**
	 * TMS draft loads for non-driver app users (TMS `user_id` = Odyssea user externalId).
	 * Same card shape as driver draft loads; rate comes from selected driver on the offer when available.
	 */
	async getStaffDraftLoadsForCurrentUser(
		userId: string,
		role: string,
		query: { project: string; page?: number; per_page?: number; is_flt?: string },
	): Promise<{
		items: Array<{
			tms_draft_id: number;
			date_created: string;
			date_updated: string;
			pick_up_date: string;
			delivery_date: string;
			offer_id: string;
			offer_numeric_id: number | null;
			offer_name: string;
			driver_rate: number | null;
			loaded_miles: number | null;
		}>;
		tms: {
			total: number;
			page: number;
			per_page: number;
			total_pages: number;
			user_id: number | string;
			project: string;
		};
	}> {
		if (role === UserRole.DRIVER) {
			throw new ForbiddenException(
				'Drivers must use GET /offers/driver/draft-loads',
			);
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const tmsUserId = user?.externalId?.trim();
		if (!tmsUserId) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['User external id (TMS user_id) is not set'],
			});
		}

		let tmsData: Awaited<
			ReturnType<TmsAppDraftLoadsService['fetchDraftLoadsForUser']>
		>;
		try {
			tmsData = await this.tmsAppDraftLoadsService.fetchDraftLoadsForUser(
				tmsUserId,
				{
					project: query.project,
					page: query.page,
					per_page: query.per_page,
					is_flt: query.is_flt,
				},
			);
		} catch {
			throw new BadGatewayException(
				'Unable to load draft loads from TMS. Please try again later.',
			);
		}

		const items = await Promise.all(
			tmsData.loads.map((row) => this.enrichDraftLoadRowForStaff(row)),
		);

		return {
			items,
			tms: {
				total: tmsData.total,
				page: tmsData.page,
				per_page: tmsData.per_page,
				total_pages: tmsData.total_pages,
				user_id: tmsData.user_id ?? tmsUserId,
				project: tmsData.project,
			},
		};
	}

	private async enrichDraftLoadRow(
		row: TmsDraftLoadRow,
		driverExternalId: string,
	): Promise<{
		tms_draft_id: number;
		date_created: string;
		date_updated: string;
		pick_up_date: string;
		delivery_date: string;
		offer_id: string;
		offer_numeric_id: number | null;
		offer_name: string;
		driver_rate: number | null;
		loaded_miles: number | null;
	}> {
		const numericId = parseOfferNumericIdFromTmsString(row.offer_id);
		let offer_name = '';
		let driver_rate: number | null = null;
		let loaded_miles: number | null = null;

		if (numericId != null) {
			const offer = await this.prisma.offer.findUnique({
				where: { id: numericId },
				select: { route: true, loadedMiles: true },
			});
			if (offer) {
				offer_name = getOfferTitleFromRoute(offer.route, numericId);
				loaded_miles = offer.loadedMiles ?? null;
				const ro = await this.prisma.rateOffer.findFirst({
					where: {
						offerId: numericId,
						driverId: driverExternalId,
						active: true,
					},
					select: { rate: true },
				});
				driver_rate = ro?.rate ?? null;
			}
		}

		return {
			tms_draft_id: row.id,
			date_created: row.date_created,
			date_updated: row.date_updated,
			pick_up_date: row.pick_up_date,
			delivery_date: row.delivery_date,
			offer_id: row.offer_id,
			offer_numeric_id: numericId,
			offer_name,
			driver_rate,
			loaded_miles,
		};
	}

	private async enrichDraftLoadRowForStaff(
		row: TmsDraftLoadRow,
	): Promise<{
		tms_draft_id: number;
		date_created: string;
		date_updated: string;
		pick_up_date: string;
		delivery_date: string;
		offer_id: string;
		offer_numeric_id: number | null;
		offer_name: string;
		driver_rate: number | null;
		loaded_miles: number | null;
	}> {
		const numericId = parseOfferNumericIdFromTmsString(row.offer_id);
		let offer_name = '';
		let driver_rate: number | null = null;
		let loaded_miles: number | null = null;

		if (numericId != null) {
			const offer = await this.prisma.offer.findUnique({
				where: { id: numericId },
				select: { route: true, loadedMiles: true },
			});
			if (offer) {
				offer_name = getOfferTitleFromRoute(offer.route, numericId);
				loaded_miles = offer.loadedMiles ?? null;
				const selected = await this.prisma.rateOffer.findFirst({
					where: {
						offerId: numericId,
						active: true,
						isSelected: true,
						rate: { not: null },
					},
					select: { rate: true },
				});
				driver_rate = selected?.rate ?? null;
				if (driver_rate == null) {
					const anyRated = await this.prisma.rateOffer.findFirst({
						where: {
							offerId: numericId,
							active: true,
							rate: { not: null },
						},
						orderBy: { id: 'asc' },
						select: { rate: true },
					});
					driver_rate = anyRated?.rate ?? null;
				}
			}
		}

		return {
			tms_draft_id: row.id,
			date_created: row.date_created,
			date_updated: row.date_updated,
			pick_up_date: row.pick_up_date,
			delivery_date: row.delivery_date,
			offer_id: row.offer_id,
			offer_numeric_id: numericId,
			offer_name,
			driver_rate,
			loaded_miles,
		};
	}

	async findAllPaginated(dto: GetOffersQueryDto) {
		const page = Math.max(1, Number(dto.page) || 1);
		const limit = Math.max(1, Math.min(100, Number(dto.limit) || 10));
		const skip = (page - 1) * limit;
		const where: Prisma.OfferWhereInput = {};

		// Filter by driver: get offer IDs from rate_offers where this driver is assigned
		const driverId =
			dto.driver_id != null && String(dto.driver_id).trim() !== ''
				? dto.driver_id.trim()
				: null;
		if (driverId) {
			const rateOffersForDriver = await this.prisma.rateOffer.findMany({
				where: { driverId },
				select: { offerId: true },
			});
			const offerIdsForDriver = [
				...new Set(rateOffersForDriver.map((ro) => ro.offerId)),
			];
			if (offerIdsForDriver.length === 0) {
				return this.buildPaginatedResponse(
					[],
					page,
					limit,
					0,
					driverId,
				);
			}
			where.id = { in: offerIdsForDriver };
		}

		if (dto.user_id != null && String(dto.user_id).trim() !== '') {
			where.externalUserId = dto.user_id.trim();
		}
		if (dto.status === 'active') {
			where.active = true;
			where.isDriverSelected = false;
		} else if (dto.status === 'inactive') {
			where.active = false;
		} else if (dto.status === 'assigned') {
			where.isDriverSelected = true;
		}

		const selectOffer = {
			id: true,
			active: true,
			isDriverSelected: true,
			externalUserId: true,
			createTime: true,
			updateTime: true,
			loadedMiles: true,
			offeredRate: true,
			weight: true,
			commodity: true,
			notes: true,
			specialRequirements: true,
			route: true,
			creator: {
				select: {
					externalId: true,
					firstName: true,
					lastName: true,
					role: true,
				},
			},
		} as const;

		const isExpiredFilter = dto.is_expired;
		const nowUnixSeconds = getCurrentUnixSeconds();

		if (isExpiredFilter === undefined || isExpiredFilter === null) {
			const [offers, total] = await Promise.all([
				this.prisma.offer.findMany({
					where,
					orderBy: { createdAt: 'desc' },
					skip,
					take: limit,
					select: selectOffer,
				}),
				this.prisma.offer.count({ where }),
			]);
			return this.buildPaginatedResponse(
				offers,
				page,
				limit,
				total,
				driverId ?? undefined,
			);
		}

		// Filter by is_expired using action_time from rate_offers (first driver per offer)
		const all = await this.prisma.offer.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			select: {
				...selectOffer,
				rateOffers: {
					select: { actionTime: true },
					orderBy: { id: 'asc' },
					take: 1,
				},
			},
		});
		const filtered = all.filter((o) => {
			const firstActionTime = o.rateOffers?.[0]?.actionTime ?? null;
			if (firstActionTime == null) return false;
			const expired = firstActionTime < nowUnixSeconds;
			return isExpiredFilter === expired;
		});
		const total = filtered.length;
		const paged = filtered.slice(skip, skip + limit);
		// Strip rateOffers before passing to buildPaginatedResponse
		const pagedOffers = paged.map(({ rateOffers: _, ...rest }) => rest);
		return this.buildPaginatedResponse(
			pagedOffers,
			page,
			limit,
			total,
			driverId ?? undefined,
		);
	}

	private async buildPaginatedResponse(
		offers: Array<{
			id: number;
			active: boolean;
			isDriverSelected: boolean;
			externalUserId: string | null;
			createTime: string;
			updateTime: string;
			loadedMiles: number | null;
			offeredRate: number | null;
			weight: number | null;
			commodity: string | null;
			notes: string | null;
			specialRequirements: unknown;
			route: unknown;
			creator?: {
				externalId: string | null;
				firstName: string;
				lastName: string;
				role: string;
			} | null;
		}>,
		page: number,
		limit: number,
		total: number,
		driverIdFilter?: string,
	) {
		const offerIds = offers.map((o) => o.id);
		const rateOfferWhere: Prisma.RateOfferWhereInput = {
			offerId: { in: offerIds },
		};
		if (driverIdFilter) {
			rateOfferWhere.driverId = driverIdFilter;
		}
		const rateOffersWithDriver = await this.prisma.rateOffer.findMany({
			where: rateOfferWhere,
			select: {
				offerId: true,
				driverId: true,
				active: true,
				isSelected: true,
				rate: true,
				actionTime: true,
				emptyMiles: true,
				totalMiles: true,
				driver: {
					select: {
						id: true,
						externalId: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						status: true,
					},
				},
			},
		});
		const driversByOfferId = new Map<
			number,
			Array<{
				driver_id: string;
				externalId: string | null;
				firstName: string;
				lastName: string;
				email: string;
				phone: string | null;
				status: string;
				active: boolean;
				is_selected: boolean;
				rate: number | null;
				action_time: number | null;
				action_time_display: string | null;
				empty_miles: number | null;
				total_miles: number | null;
			}>
		>();
		for (const ro of rateOffersWithDriver) {
			const list = driversByOfferId.get(ro.offerId) ?? [];
			const fallbackExternalId =
				ro.driver?.externalId ?? ro.driverId ?? null;
			const fallbackName =
				!ro.driver && fallbackExternalId != null
					? fallbackExternalId
					: '';
			list.push({
				driver_id: ro.driver?.id ?? fallbackExternalId ?? '',
				externalId: fallbackExternalId,
				firstName: ro.driver?.firstName ?? fallbackName,
				lastName: ro.driver?.lastName ?? '',
				email: ro.driver?.email ?? '',
				phone: ro.driver?.phone ?? null,
				status: ro.driver?.status ?? 'INACTIVE',
				active: ro.active,
				is_selected: ro.isSelected,
				rate: ro.rate ?? null,
				action_time: ro.actionTime != null ? Number(ro.actionTime) : null,
				action_time_display: formatActionTimeUnixToNyString(ro.actionTime),
				empty_miles: ro.emptyMiles ?? null,
				total_miles: ro.totalMiles ?? null,
			});
			driversByOfferId.set(ro.offerId, list);
		}

		const results = offers.map((o) => {
			const drivers = driversByOfferId.get(o.id) ?? [];
			const isActiveForRequestedDriver = driverIdFilter
				? Boolean(drivers[0]?.active) && o.active
				: o.active;

			return {
				id: o.id,
				active: isActiveForRequestedDriver,
				is_driver_selected: o.isDriverSelected,
				external_user_id: o.externalUserId,
				create_time: o.createTime,
				update_time: o.updateTime,
				loaded_miles: o.loadedMiles,
				offered_rate: o.offeredRate,
				weight: o.weight,
				commodity: o.commodity,
				special_requirements: o.specialRequirements,
				notes: o.notes,
				route: o.route ?? null,
				creator: o.creator
					? {
							firstName: o.creator.firstName,
							lastName: o.creator.lastName,
							externalId: o.creator.externalId,
							role: o.creator.role,
						}
					: null,
				drivers,
			};
		});

		return {
			results,
			pagination: {
				current_page: page,
				per_page: limit,
				total_count: total,
				total_pages: Math.ceil(total / limit) || 1,
				has_next_page: page < Math.ceil(total / limit),
				has_prev_page: page > 1,
			},
		};
	}

	/**
	 * Add drivers to an existing offer: creates rate_offers rows and merges driver IDs into offer.drivers.
	 * Skips drivers already linked to the offer.
	 * driverIds in the request can be User.externalId or User.id; they are resolved to externalId for rate_offers.
	 */
	async addDriversToOffer(offerId: number, dto: AddDriversToOfferDto) {
		const driverIds = Array.isArray(dto.driverIds) ? dto.driverIds : [];
		if (driverIds.length === 0) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['At least one driver ID is required'],
			});
		}

		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: {
				id: true,
				drivers: true,
				updateTime: true,
				route: true,
				loadedMiles: true,
			},
		});
		if (!offer) {
			throw new NotFoundException(`Offer with id ${offerId} not found`);
		}

		const existingRateOffers = await this.prisma.rateOffer.findMany({
			where: { offerId },
			select: { driverId: true },
		});
		const existingDriverIdsSet = new Set(
			existingRateOffers.map((ro) => ro.driverId).filter(Boolean),
		);

		// Resolve each requested id to User.externalId (rate_offers.driver_id references User.externalId)
		const users = await this.prisma.user.findMany({
			where: {
				OR: [
					{ id: { in: driverIds } },
					{ externalId: { in: driverIds } },
				],
			},
			select: { id: true, externalId: true },
		});
		const idToExternalId = new Map<string, string>();
		for (const u of users) {
			if (u.externalId) {
				idToExternalId.set(u.id, u.externalId);
				idToExternalId.set(u.externalId, u.externalId);
			}
		}

		const newExternalIds: string[] = [];
		for (const id of driverIds) {
			const externalId = idToExternalId.get(id);
			// Only add drivers that exist in User table (rate_offers.driver_id FK to User.externalId)
			if (externalId && !existingDriverIdsSet.has(externalId)) {
				newExternalIds.push(externalId);
				existingDriverIdsSet.add(externalId);
			}
		}

		if (newExternalIds.length === 0) {
			return {
				success: true,
				message: 'All selected drivers are already in the offer',
				addedCount: 0,
				addedDriverExternalIds: [] as string[],
			};
		}

		const nowNy = nowInNewYorkAsLocaleString();
		const loadedMilesNum =
			offer.loadedMiles != null && !Number.isNaN(Number(offer.loadedMiles))
				? Number(offer.loadedMiles)
				: null;
		const driverEmptyMiles = dto.driverEmptyMiles ?? {};
		const externalIdToSourceId = new Map<string, string>();
		for (const id of driverIds) {
			const externalId = idToExternalId.get(id);
			if (externalId && !externalIdToSourceId.has(externalId)) {
				externalIdToSourceId.set(externalId, id);
			}
		}

		const currentDriversJson = offer.drivers as string[] | null | undefined;
		const currentDrivers = Array.isArray(currentDriversJson)
			? [...currentDriversJson]
			: [];
		const mergedDrivers = Array.from(
			new Set([...currentDrivers, ...newExternalIds]),
		);

		await this.prisma.$transaction(async (tx) => {
			await tx.rateOffer.createMany({
				data: newExternalIds.map((driverId) => {
					const sourceId =
						externalIdToSourceId.get(driverId) ?? driverId;
					const emptyMilesRaw =
						driverEmptyMiles[sourceId] ??
						driverEmptyMiles[driverId];
					const emptyMiles =
						emptyMilesRaw != null &&
						!Number.isNaN(Number(emptyMilesRaw))
							? Number(emptyMilesRaw)
							: null;
					const totalMiles =
						loadedMilesNum != null && emptyMiles != null
							? loadedMilesNum + emptyMiles
							: null;
					const rec: {
						offerId: number;
						driverId: string;
						rate: null;
						emptyMiles?: number;
						totalMiles?: number;
					} = {
						offerId: offer.id,
						driverId,
						rate: null,
					};
					if (emptyMiles != null) rec.emptyMiles = emptyMiles;
					if (totalMiles != null) rec.totalMiles = totalMiles;
					return rec;
				}),
			});
			await tx.offer.update({
				where: { id: offerId },
				data: {
					drivers: mergedDrivers as Prisma.InputJsonValue,
					updateTime: nowNy,
				},
			});
		});

		const result: {
			success: boolean;
			addedCount: number;
			addedDriverExternalIds: string[];
			route?: Array<{ location?: string }>;
		} = {
			success: true,
			addedCount: newExternalIds.length,
			addedDriverExternalIds: newExternalIds,
		};
		if (newExternalIds.length > 0 && offer.route) {
			result.route = offer.route as Array<{ location?: string }>;
		}
		return result;
	}

	/**
	 * Set active=false for the offer.
	 */
	async deactivateOffer(offerId: number) {
		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: { id: true, route: true },
		});
		if (!offer) {
			throw new NotFoundException(`Offer with id ${offerId} not found`);
		}
		await this.prisma.offer.update({
			where: { id: offerId },
			data: {
				active: false,
				updateTime: nowInNewYorkAsLocaleString(),
			},
		});
		return { success: true, message: 'Offer deactivated' };
	}

	/**
	 * Set active=false for the rate_offer row (offer_id + driver_id by externalId).
	 * Driver remains in administrators list, but becomes inactive.
	 */
	async removeDriverFromOffer(offerId: number, driverExternalId: string) {
		const updated = await this.prisma.rateOffer.updateMany({
			where: {
				offerId,
				driverId: driverExternalId,
			},
			data: {
				active: false,
				rate: null,
				actionTime: null,
				driverEta: null,
			},
		});
		if (updated.count === 0) {
			throw new NotFoundException(
				`Rate offer not found for offer ${offerId} and driver ${driverExternalId}`,
			);
		}

		return { success: true, message: 'Driver removed from offer' };
	}

	/**
	 * Get offer notification context for creator and admins.
	 * Returns recipient user IDs (creator + admins, deduplicated), offer title, and driver info.
	 */
	async getOfferNotificationContext(
		offerId: number,
		driverExternalId: string,
	): Promise<{
		recipientUserIds: string[];
		offerTitle: string;
		driverName: string;
		driverAvatar: string | null;
	} | null> {
		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: { externalUserId: true, route: true },
		});
		if (!offer) return null;

		const driver = await this.prisma.user.findUnique({
			where: { externalId: driverExternalId },
			select: { firstName: true, lastName: true, profilePhoto: true },
		});
		const driverName = driver
			? `${driver.firstName} ${driver.lastName}`.trim() || 'Driver'
			: 'Driver';
		const driverAvatar = driver?.profilePhoto ?? null;
		const offerTitle = getOfferTitleFromRoute(offer.route, offerId);

		const recipientIds = new Set<string>();

		if (
			offer.externalUserId &&
			!EXCLUDED_OFFER_NOTIFICATION_EXTERNAL_IDS.includes(offer.externalUserId)
		) {
			const creator = await this.prisma.user.findUnique({
				where: { externalId: offer.externalUserId },
				select: { id: true },
			});
			if (creator) recipientIds.add(creator.id);
		}

		const admins = await this.prisma.user.findMany({
			where: {
				role: 'ADMINISTRATOR',
				AND: ADMIN_EXTERNAL_IDS_EXCLUDED_FROM_OFFER_NOTIFICATIONS.map(
					(externalId) => ({ NOT: { externalId } }),
				),
			},
			select: { id: true },
		});
		if (admins.length > 0) {
			admins.forEach((a) => recipientIds.add(a.id));
		}

		return {
			recipientUserIds: Array.from(recipientIds),
			offerTitle,
			driverName,
			driverAvatar,
		};
	}

	async returnDriverToOffer(offerId: number, driverExternalId: string) {
		const nowNy = nowInNewYorkAsLocaleString();
		const updated = await this.prisma.$transaction(async (tx) => {
			const result = await tx.rateOffer.updateMany({
				where: {
					offerId,
					driverId: driverExternalId,
				},
				data: { active: true },
			});
			if (result.count === 0) {
				return result;
			}
			await tx.offer.update({
				where: { id: offerId },
				data: { updateTime: nowNy },
			});
			return result;
		});
		if (updated.count === 0) {
			throw new NotFoundException(
				`Rate offer not found for offer ${offerId} and driver ${driverExternalId}`,
			);
		}
		return { success: true, message: 'Driver returned to offer' };
	}

	async selectDriverForOffer(offerId: number, driverExternalId: string) {
		const normalizedDriverExternalId = driverExternalId.trim();
		if (!normalizedDriverExternalId) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['driverExternalId is required'],
			});
		}

		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: {
				id: true,
				route: true,
				externalUserId: true,
				weight: true,
				commodity: true,
				notes: true,
				specialRequirements: true,
				loadedMiles: true,
			},
		});
		if (!offer) {
			throw new NotFoundException(`Offer with id ${offerId} not found`);
		}

		const rateOffers = await this.prisma.rateOffer.findMany({
			where: { offerId },
			select: {
				id: true,
				driverId: true,
				rate: true,
				emptyMiles: true,
				totalMiles: true,
			},
		});
		const selectedRateOffer = rateOffers.find(
			(rateOffer) => rateOffer.driverId === normalizedDriverExternalId,
		);
		if (!selectedRateOffer) {
			throw new NotFoundException(
				`Rate offer not found for offer ${offerId} and driver ${normalizedDriverExternalId}`,
			);
		}

		const tmsUserId = parseOfferExternalUserIdToTmsUserId(offer.externalUserId);
		const tmsDriverId = /^\d+$/.test(normalizedDriverExternalId)
			? parseInt(normalizedDriverExternalId, 10)
			: normalizedDriverExternalId;

		const routeForTms = normalizeRouteForTms(offer.route);
		if (routeForTms.length === 0) {
			throw new BadRequestException({
				message: 'Cannot accept driver: offer route is empty or invalid for TMS',
			});
		}

		const specialReqs = normalizeSpecialRequirementsForTms(
			offer.specialRequirements,
		);
		const rateNum =
			selectedRateOffer.rate != null ? Number(selectedRateOffer.rate) : 0;
		const weightNum = offer.weight != null ? Number(offer.weight) : 0;
		const emptyMilesNum =
			selectedRateOffer.emptyMiles != null
				? Number(selectedRateOffer.emptyMiles)
				: 0;
		const loadedMilesNum =
			selectedRateOffer.totalMiles != null
				? Number(selectedRateOffer.totalMiles)
				: offer.loadedMiles != null
					? Number(offer.loadedMiles)
					: 0;

		let postId: number;
		try {
			postId = await this.tmsLoadDraftService.createLoadDraft({
				project: 'odysseia',
				user_id: tmsUserId,
				driver_id: tmsDriverId,
				offer_id: `OFF-${offerId}`,
				commodity: offer.commodity?.trim() || 'General Freight',
				notes: offer.notes?.trim() || 'Created from external app',
				weight: weightNum,
				rate: rateNum,
				empty_miles: emptyMilesNum,
				loaded_miles: loadedMilesNum,
				special_requirements: specialReqs,
				route: routeForTms,
			});
		} catch (error) {
			const ax = error as AxiosError;
			const detail =
				ax.response?.data != null
					? JSON.stringify(ax.response.data)
					: (error as Error).message;
			throw new BadGatewayException(`TMS load draft failed: ${detail}`);
		}

		const nowNy = nowInNewYorkAsLocaleString();
		const affectedDriverExternalIds = rateOffers
			.map((rateOffer) => String(rateOffer.driverId ?? '').trim())
			.filter(Boolean);

		await this.prisma.$transaction(async (tx) => {
			await tx.rateOffer.updateMany({
				where: {
					offerId,
					id: { not: selectedRateOffer.id },
				},
				data: {
					active: false,
					isSelected: false,
				},
			});

			await tx.rateOffer.update({
				where: { id: selectedRateOffer.id },
				data: {
					active: true,
					isSelected: true,
				},
			});

			await tx.offer.update({
				where: { id: offerId },
				data: {
					isDriverSelected: true,
					loadId: String(postId),
					updateTime: nowNy,
				},
			});
		});

		const selectedUser = await this.prisma.user.findUnique({
			where: { externalId: normalizedDriverExternalId },
			select: { id: true },
		});

		if (selectedUser) {
			try {
				await this.notificationsService.createOfferSelectedNotification({
					userId: selectedUser.id,
					offerId,
					offerTitle: getOfferTitleFromRoute(offer.route, offerId),
				});
			} catch (error) {
				console.error(
					`Failed to create selected driver notification for offer ${offerId}:`,
					error,
				);
			}
		}

		return {
			success: true,
			message: 'Driver selected successfully',
			affectedDriverExternalIds,
		};
	}
}
