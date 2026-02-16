import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { GetOffersQueryDto } from './dto/get-offers-query.dto';

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
		if (!dto.pickUpLocation?.trim()) {
			errors.push('Pick up location is required');
		}
		if (!dto.pickUpTime?.trim()) {
			errors.push('Pick up time is required');
		}
		if (!dto.deliveryLocation?.trim()) {
			errors.push('Delivery location is required');
		}
		if (!dto.deliveryTime?.trim()) {
			errors.push('Delivery time is required');
		}
		const loadedMiles = dto.loadedMiles;
		if (
			loadedMiles == null ||
			(typeof loadedMiles === 'number' && Number.isNaN(loadedMiles))
		) {
			errors.push('Loaded miles is required');
		}
		const emptyMiles = dto.emptyMiles;
		if (
			emptyMiles == null ||
			(typeof emptyMiles === 'number' && Number.isNaN(emptyMiles))
		) {
			errors.push('Empty miles is required');
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
		const actionTimeMinutes = Math.max(
			0,
			parseInt(String(dto.actionTime || '15'), 10) || 15,
		);
		const actionTimeNy = getNewYorkTimePlusMinutes(actionTimeMinutes);
		const driversJson: Prisma.InputJsonValue | undefined =
			driverIds.length > 0 ? driverIds : undefined;
		const specialRequirementsJson: Prisma.InputJsonValue | undefined =
			dto.specialRequirements && dto.specialRequirements.length > 0
				? dto.specialRequirements
				: undefined;

		return this.prisma.$transaction(async (tx) => {
			const offer = await tx.offer.create({
				data: {
					externalUserId: dto.externalId || null,
					createTime: nowNy,
					updateTime: nowNy,
					actionTime: actionTimeNy,
					pickUpLocation: dto.pickUpLocation,
					pickUpTime: dto.pickUpTime,
					deliveryLocation: dto.deliveryLocation,
					deliveryTime: dto.deliveryTime,
					loadedMiles: dto.loadedMiles ?? null,
					emptyMiles: dto.emptyMiles ?? null,
					totalMiles: dto.totalMiles ?? null,
					weight: dto.weight ?? null,
					commodity: dto.commodity?.trim() || null,
					specialRequirements:
						specialRequirementsJson ?? Prisma.JsonNull,
					drivers: driversJson ?? Prisma.JsonNull,
				},
			});

			if (driverIds.length > 0) {
				await tx.rateOffer.createMany({
					data: driverIds.map((driverId) => ({
						offerId: offer.id,
						driverId: driverId.trim() || null,
						rate: null,
					})),
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
		const sortOrder = dto.sort_order === 'action_time_desc' ? 'desc' : 'asc'; // default: asc (soonest to expire first)
		const where: Prisma.OfferWhereInput = {};
		if (dto.user_id != null && String(dto.user_id).trim() !== '') {
			where.externalUserId = dto.user_id.trim();
		}

		const selectOffer = {
			id: true,
			externalUserId: true,
			createTime: true,
			updateTime: true,
			actionTime: true,
			pickUpLocation: true,
			pickUpTime: true,
			deliveryLocation: true,
			deliveryTime: true,
			loadedMiles: true,
			emptyMiles: true,
			weight: true,
			commodity: true,
			specialRequirements: true,
			totalMiles: true,
		} as const;

		const isExpiredFilter = dto.is_expired;
		const nowNy = new Date();

		if (isExpiredFilter === undefined || isExpiredFilter === null) {
			const [offers, total] = await Promise.all([
				this.prisma.offer.findMany({
					where,
					orderBy: { actionTime: sortOrder },
					skip,
					take: limit,
					select: selectOffer,
				}),
				this.prisma.offer.count({ where }),
			]);
			return this.buildPaginatedResponse(offers, page, limit, total);
		}

		const all = await this.prisma.offer.findMany({
			where,
			orderBy: { actionTime: sortOrder },
			select: selectOffer,
		});
		const filtered = all.filter((o) => {
			const at = parseActionTimeNy(o.actionTime);
			if (!at) return false;
			const expired = at.getTime() < nowNy.getTime();
			return isExpiredFilter === expired;
		});
		const total = filtered.length;
		const paged = filtered.slice(skip, skip + limit);
		return this.buildPaginatedResponse(paged, page, limit, total);
	}

	private async buildPaginatedResponse(
		offers: Array<{
			id: string;
			externalUserId: string | null;
			createTime: string;
			updateTime: string;
			actionTime: string | null;
			pickUpLocation: string;
			pickUpTime: string;
			deliveryLocation: string;
			deliveryTime: string;
			loadedMiles: number | null;
			emptyMiles: number | null;
			weight: number | null;
			commodity: string | null;
			specialRequirements: unknown;
			totalMiles: number | null;
		}>,
		page: number,
		limit: number,
		total: number,
	) {
		const offerIds = offers.map((o) => o.id);
		// rate_offers: one row per (offer_id, driver_id) with rate — filter by offer_id to get rate per driver for this offer
		const rateOffersWithDriver = await this.prisma.rateOffer.findMany({
			where: { offerId: { in: offerIds } },
			select: {
				offerId: true,
				rate: true,
				driver: {
					select: {
						externalId: true,
						firstName: true,
						lastName: true,
					},
				},
			},
		});
		const driversByOfferId = new Map<
			string,
			Array<{
				externalId: string | null;
				firstName: string;
				lastName: string;
				rate: number | null;
			}>
		>();
		for (const ro of rateOffersWithDriver) {
			if (!ro.driver) continue;
			const list = driversByOfferId.get(ro.offerId) ?? [];
			list.push({
				externalId: ro.driver.externalId,
				firstName: ro.driver.firstName,
				lastName: ro.driver.lastName,
				rate: ro.rate ?? null,
			});
			driversByOfferId.set(ro.offerId, list);
		}

		const results = offers.map((o) => ({
			id: o.id,
			external_user_id: o.externalUserId,
			create_time: o.createTime,
			update_time: o.updateTime,
			pick_up_location: o.pickUpLocation,
			pick_up_time: o.pickUpTime,
			delivery_location: o.deliveryLocation,
			delivery_time: o.deliveryTime,
			loaded_miles: o.loadedMiles,
			empty_miles: o.emptyMiles,
			weight: o.weight,
			commodity: o.commodity,
			special_requirements: o.specialRequirements,
			total_miles: o.totalMiles,
			action_time: o.actionTime,
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
}
