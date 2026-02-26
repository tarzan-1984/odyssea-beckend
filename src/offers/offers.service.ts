import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';
import { AddDriversToOfferDto } from './dto/add-drivers-to-offer.dto';

const NY_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
	timeZone: 'America/New_York',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
};

/** Returns current date/time string in America/New_York timezone */
function getNewYorkTimeString(): string {
	return new Date().toLocaleString('en-US', NY_FORMAT_OPTS);
}

/** Returns date/time in America/New_York: base time + minutesToAdd */
function getNewYorkTimePlusMinutes(minutesToAdd: number): string {
	const d = new Date();
	d.setMinutes(d.getMinutes() + minutesToAdd);
	return d.toLocaleString('en-US', NY_FORMAT_OPTS);
}

/** Parse action_time string (NY format MM/DD/YYYY, HH24:MI:SS) to Date (ET). Returns null if invalid. */
function parseActionTimeNy(actionTime: string | null | undefined): Date | null {
	if (!actionTime || typeof actionTime !== 'string') return null;
	const trimmed = actionTime.trim();
	const comma = trimmed.indexOf(', ');
	if (comma === -1) return null;
	const datePart = trimmed.slice(0, comma);
	const timePart = trimmed.slice(comma + 2);
	const [mo, day, yr] = datePart.split('/');
	if (!mo || !day || !yr || !timePart) return null;
	const iso = `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}T${timePart}-05:00`;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class OffersService {
	constructor(private readonly prisma: PrismaService) {}

	async create(dto: CreateOfferDto) {
		// Validate required and hidden fields before creating offer
		const errors: string[] = [];
		if (!dto.externalId || String(dto.externalId).trim() === '') {
			errors.push('externalId is required');
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

		const nowNy = getNewYorkTimeString();
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
		const driverEmptyMiles = dto.driverEmptyMiles ?? {};

		return this.prisma.$transaction(async (tx) => {
			const offer = await tx.offer.create({
				data: {
					externalUserId: dto.externalId || null,
					createTime: nowNy,
					updateTime: nowNy,
					loadedMiles: loadedMilesNum,
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
						emptyMilesRaw != null && !Number.isNaN(Number(emptyMilesRaw))
							? Number(emptyMilesRaw)
							: null;
					const totalMiles =
						loadedMilesNum != null && emptyMiles != null
							? loadedMilesNum + emptyMiles
							: null;
					const rec: {
						offerId: string;
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
	}

	/**
	 * Get offers with pagination, optional filters (is_expired, user_id), and drivers from users.
	 * action_time comparison uses current time in America/New_York.
	 */
	async findAllPaginated(dto: GetOffersQueryDto) {
		const page = Math.max(1, Number(dto.page) || 1);
		const limit = Math.max(1, Math.min(100, Number(dto.limit) || 10));
		const skip = (page - 1) * limit;
		const where: Prisma.OfferWhereInput = {};
		if (dto.user_id != null && String(dto.user_id).trim() !== '') {
			where.externalUserId = dto.user_id.trim();
		}
		if (dto.status === 'active') {
			where.active = true;
		} else if (dto.status === 'inactive') {
			where.active = false;
		}

		const selectOffer = {
			id: true,
			active: true,
			externalUserId: true,
			createTime: true,
			updateTime: true,
			loadedMiles: true,
			weight: true,
			commodity: true,
			notes: true,
			specialRequirements: true,
			route: true,
		} as const;

		const isExpiredFilter = dto.is_expired;
		const nowNy = new Date();

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
			return this.buildPaginatedResponse(offers, page, limit, total);
		}

		// Filter by is_expired using action_time from rate_offers (first driver per offer)
		const all = await this.prisma.offer.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			select: { ...selectOffer, rateOffers: { select: { actionTime: true }, orderBy: { id: 'asc' }, take: 1 } },
		});
		const filtered = all.filter((o) => {
			const firstActionTime = o.rateOffers?.[0]?.actionTime ?? null;
			const at = parseActionTimeNy(firstActionTime);
			if (!at) return false;
			const expired = at.getTime() < nowNy.getTime();
			return isExpiredFilter === expired;
		});
		const total = filtered.length;
		const paged = filtered.slice(skip, skip + limit);
		// Strip rateOffers before passing to buildPaginatedResponse
		const pagedOffers = paged.map(({ rateOffers: _, ...rest }) => rest);
		return this.buildPaginatedResponse(pagedOffers, page, limit, total);
	}

	private async buildPaginatedResponse(
		offers: Array<{
			id: string;
			active: boolean;
			externalUserId: string | null;
			createTime: string;
			updateTime: string;
			loadedMiles: number | null;
			weight: number | null;
			commodity: string | null;
			notes: string | null;
			specialRequirements: unknown;
			route: unknown;
		}>,
		page: number,
		limit: number,
		total: number,
	) {
		const offerIds = offers.map((o) => o.id);
		const rateOffersWithDriver = await this.prisma.rateOffer.findMany({
			where: { offerId: { in: offerIds }, active: true },
			select: {
				offerId: true,
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
			string,
			Array<{
				driver_id: string;
				externalId: string | null;
				firstName: string;
				lastName: string;
				email: string;
				phone: string | null;
				status: string;
				rate: number | null;
				action_time: string | null;
				empty_miles: number | null;
				total_miles: number | null;
			}>
		>();
		for (const ro of rateOffersWithDriver) {
			if (!ro.driver) continue;
			const list = driversByOfferId.get(ro.offerId) ?? [];
			list.push({
				driver_id: ro.driver.id,
				externalId: ro.driver.externalId,
				firstName: ro.driver.firstName,
				lastName: ro.driver.lastName,
				email: ro.driver.email,
				phone: ro.driver.phone ?? null,
				status: ro.driver.status,
				rate: ro.rate ?? null,
				action_time: ro.actionTime ?? null,
				empty_miles: ro.emptyMiles ?? null,
				total_miles: ro.totalMiles ?? null,
			});
			driversByOfferId.set(ro.offerId, list);
		}

		const results = offers.map((o) => ({
			id: o.id,
			active: o.active,
			external_user_id: o.externalUserId,
			create_time: o.createTime,
			update_time: o.updateTime,
			loaded_miles: o.loadedMiles,
			weight: o.weight,
			commodity: o.commodity,
			special_requirements: o.specialRequirements,
			notes: o.notes,
			route: o.route ?? null,
			drivers: driversByOfferId.get(o.id) ?? [],
		}));

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
	async addDriversToOffer(offerId: string, dto: AddDriversToOfferDto) {
		const driverIds = Array.isArray(dto.driverIds) ? dto.driverIds : [];
		if (driverIds.length === 0) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors: ['At least one driver ID is required'],
			});
		}

		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: { id: true, drivers: true, updateTime: true },
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
			};
		}

		const nowNy = getNewYorkTimeString();
		const currentDriversJson = offer.drivers as string[] | null | undefined;
		const currentDrivers = Array.isArray(currentDriversJson)
			? [...currentDriversJson]
			: [];
		const mergedDrivers = Array.from(
			new Set([...currentDrivers, ...newExternalIds]),
		);

		await this.prisma.$transaction(async (tx) => {
			await tx.rateOffer.createMany({
				data: newExternalIds.map((driverId) => ({
					offerId: offer.id,
					driverId,
					rate: null,
				})),
			});
			await tx.offer.update({
				where: { id: offerId },
				data: {
					drivers: mergedDrivers as Prisma.InputJsonValue,
					updateTime: nowNy,
				},
			});
		});

		return {
			success: true,
			addedCount: newExternalIds.length,
		};
	}

	/**
	 * Set active=false for the offer.
	 */
	async deactivateOffer(offerId: string) {
		const offer = await this.prisma.offer.findUnique({
			where: { id: offerId },
			select: { id: true },
		});
		if (!offer) {
			throw new NotFoundException(`Offer with id ${offerId} not found`);
		}
		await this.prisma.offer.update({
			where: { id: offerId },
			data: { active: false },
		});
		return { success: true, message: 'Offer deactivated' };
	}

	/**
	 * Set active=false for the rate_offer row (offer_id + driver_id by externalId).
	 * Driver will no longer appear in offer drivers list.
	 */
	async removeDriverFromOffer(offerId: string, driverExternalId: string) {
		const updated = await this.prisma.rateOffer.updateMany({
			where: {
				offerId,
				driverId: driverExternalId,
			},
			data: { active: false },
		});
		if (updated.count === 0) {
			throw new NotFoundException(
				`Rate offer not found for offer ${offerId} and driver ${driverExternalId}`,
			);
		}
		return { success: true, message: 'Driver removed from offer' };
	}
}
