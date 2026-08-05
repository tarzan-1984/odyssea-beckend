import { BadRequestException, Injectable } from '@nestjs/common';
import {
	LoadBoardEquipment,
	LoadBoardLoadType,
	Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePointDto } from '../offers/dto/create-offer.dto';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';
import { CreateLoadBoardShipmentDto } from './dto/create-load-board-shipment.dto';

function normalizeRoute(route: RoutePointDto[]): RoutePointDto[] {
	return route.map((point) => ({
		type: point.type,
		location: point.location.trim(),
		time: point.time?.trim() ?? '',
		...(point.latitude != null ? { latitude: point.latitude } : {}),
		...(point.longitude != null ? { longitude: point.longitude } : {}),
	}));
}

function validateRoute(route: RoutePointDto[]): void {
	if (route.length < 2) {
		throw new BadRequestException('route must contain at least two points');
	}

	const pickupCount = route.filter(
		(point) => point.type === 'pick_up_location',
	).length;
	const deliveryCount = route.filter(
		(point) => point.type === 'delivery_location',
	).length;

	if (pickupCount < 1 || deliveryCount < 1) {
		throw new BadRequestException(
			'route must contain at least one pick_up_location and one delivery_location',
		);
	}

	if (route[0].type !== 'pick_up_location') {
		throw new BadRequestException('first route point must be pick_up_location');
	}

	if (route[route.length - 1].type !== 'delivery_location') {
		throw new BadRequestException(
			'last route point must be delivery_location',
		);
	}

	if (route.some((point) => !point.location)) {
		throw new BadRequestException('each route point must have a location');
	}
}

@Injectable()
export class LoadBoardShipmentsService {
	constructor(private readonly prisma: PrismaService) {}

	async create(dto: CreateLoadBoardShipmentDto, userId: string) {
		const creator = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, externalId: true },
		});
		if (!creator) {
			throw new BadRequestException('Creator user not found');
		}

		const normalizedRoute = normalizeRoute(dto.route);
		validateRoute(normalizedRoute);

		const pickupEarliest = dto.pickupEarliest.trim();
		if (!pickupEarliest) {
			throw new BadRequestException('pickupEarliest is required');
		}

		const commodity = dto.commodity.trim();
		if (!commodity) {
			throw new BadRequestException('commodity is required');
		}
		if (commodity.length > 100) {
			throw new BadRequestException('commodity must be at most 100 characters');
		}

		const comments = dto.comments?.trim() || null;
		if (comments && comments.length > 140) {
			throw new BadRequestException('comments must be at most 140 characters');
		}

		const equipment = dto.equipment;
		const needsEquipmentSize =
			equipment === LoadBoardEquipment.box_truck ||
			equipment === LoadBoardEquipment.dry_van;

		const equipmentLength = needsEquipmentSize
			? dto.equipmentLength ?? null
			: null;
		const equipmentWeight = needsEquipmentSize
			? dto.equipmentWeight ?? null
			: null;

		const specialInstructions =
			dto.specialInstructions
				?.map((item) => item.trim())
				.filter(Boolean) ?? [];

		const userExternalId = creator.externalId?.trim() || null;
		const nowNy = nowInNewYorkAsNaiveDate();

		const shipment = await this.prisma.loadBoardShipment.create({
			data: {
				userId: creator.id,
				userExternalId,
				route: normalizedRoute as unknown as Prisma.InputJsonValue,
				pickupEarliest,
				pickupLatest: dto.pickupLatest?.trim() || null,
				pickupHours: dto.pickupHours?.trim() || null,
				dropOffHours: dto.dropOffHours?.trim() || null,
				weight: dto.weight,
				commodity,
				specialInstructions:
					specialInstructions.length > 0
						? (specialInstructions as unknown as Prisma.InputJsonValue)
						: Prisma.JsonNull,
				loadType: dto.loadType ?? LoadBoardLoadType.full,
				equipment,
				equipmentLength,
				equipmentWeight,
				comments,
				referenceId: dto.referenceId?.trim() || null,
				createdAt: nowNy,
				updatedAt: nowNy,
			},
			include: {
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						externalId: true,
					},
				},
			},
		});

		return shipment;
	}
}
