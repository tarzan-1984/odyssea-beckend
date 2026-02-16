import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';

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
		if (loadedMiles == null || (typeof loadedMiles === 'number' && Number.isNaN(loadedMiles))) {
			errors.push('Loaded miles is required');
		}
		const emptyMiles = dto.emptyMiles;
		if (emptyMiles == null || (typeof emptyMiles === 'number' && Number.isNaN(emptyMiles))) {
			errors.push('Empty miles is required');
		}
		const weight = dto.weight;
		if (weight == null || (typeof weight === 'number' && Number.isNaN(weight))) {
			errors.push('Weight is required');
		}
		if (errors.length > 0) {
			throw new BadRequestException({
				message: 'Validation failed',
				errors,
			});
		}

		const nowNy = getNewYorkTimeString();
		const actionTimeMinutes = Math.max(0, parseInt(String(dto.actionTime || '15'), 10) || 15);
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
}
