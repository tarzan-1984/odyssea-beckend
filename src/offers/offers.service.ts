import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOfferDto } from './dto/create-offer.dto';

/**
 * Returns current date/time string in America/New_York timezone
 */
function getNewYorkTimeString(): string {
	return new Date().toLocaleString('en-US', {
		timeZone: 'America/New_York',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	});
}

@Injectable()
export class OffersService {
	constructor(private readonly prisma: PrismaService) {}

	async create(dto: CreateOfferDto) {
		const nowNy = getNewYorkTimeString();
		const driverIds = Array.isArray(dto.driverIds) ? dto.driverIds : [];
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
