import {
	BadRequestException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import {
	LoadBoardEquipment,
	LoadBoardLoadType,
	LoadBoardShipmentStatus,
	Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoutePointDto } from '../offers/dto/create-offer.dto';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';
import { CreateLoadBoardShipmentDto } from './dto/create-load-board-shipment.dto';
import { LoadBoardRealtimeService } from './load-board-realtime.service';
import {
	assertLoadBoardPickupNotInPast,
	isLoadBoardPickupExpired,
} from './load-board-pickup.util';

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

const shipmentUserInclude = {
	user: {
		select: {
			id: true,
			firstName: true,
			lastName: true,
			externalId: true,
		},
	},
} as const;

export type LoadBoardAgeSort = 'asc' | 'desc';

@Injectable()
export class LoadBoardShipmentsService {
	constructor(
		private readonly prisma: PrismaService,
		private readonly loadBoardRealtimeService: LoadBoardRealtimeService,
	) {}

	private buildShipmentFields(dto: CreateLoadBoardShipmentDto) {
		const normalizedRoute = normalizeRoute(dto.route);
		validateRoute(normalizedRoute);

		const pickupEarliest = dto.pickupEarliest.trim();
		if (!pickupEarliest) {
			throw new BadRequestException('pickupEarliest is required');
		}

		assertLoadBoardPickupNotInPast({
			pickupEarliest,
			pickupLatest: dto.pickupLatest,
			pickupHours: dto.pickupHours,
		});

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

		const specialInstructions =
			dto.specialInstructions
				?.map((item) => item.trim())
				.filter(Boolean) ?? [];

		const rate =
			dto.rate != null && Number.isFinite(dto.rate) ? dto.rate : null;

		return {
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
			equipmentLength: needsEquipmentSize
				? (dto.equipmentLength ?? null)
				: null,
			equipmentWeight: needsEquipmentSize
				? (dto.equipmentWeight ?? null)
				: null,
			comments,
			referenceId: dto.referenceId?.trim() || null,
			rate,
			status: dto.status ?? LoadBoardShipmentStatus.posted,
		};
	}

	private withPickupExpired<T extends {
		pickupEarliest: string;
		pickupLatest: string | null;
		pickupHours: string | null;
	}>(shipment: T) {
		return {
			...shipment,
			pickupExpired: isLoadBoardPickupExpired({
				pickupEarliest: shipment.pickupEarliest,
				pickupLatest: shipment.pickupLatest,
				pickupHours: shipment.pickupHours,
			}),
		};
	}

	async create(dto: CreateLoadBoardShipmentDto, userId: string) {
		const creator = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, externalId: true },
		});
		if (!creator) {
			throw new BadRequestException('Creator user not found');
		}

		const fields = this.buildShipmentFields(dto);
		const nowNy = nowInNewYorkAsNaiveDate();

		const shipment = await this.prisma.loadBoardShipment.create({
			data: {
				userId: creator.id,
				userExternalId: creator.externalId?.trim() || null,
				...fields,
				createdAt: nowNy,
				updatedAt: nowNy,
			},
			include: shipmentUserInclude,
		});

		return this.withPickupExpired(shipment);
	}

	async update(id: number, dto: CreateLoadBoardShipmentDto) {
		const existing = await this.prisma.loadBoardShipment.findUnique({
			where: { id },
			select: { id: true, status: true },
		});
		if (!existing) {
			throw new NotFoundException('Shipment not found');
		}

		const fields = this.buildShipmentFields({
			...dto,
			status: dto.status ?? existing.status,
		});
		const nowNy = nowInNewYorkAsNaiveDate();

		const shipment = await this.prisma.loadBoardShipment.update({
			where: { id },
			data: {
				...fields,
				updatedAt: nowNy,
			},
			include: shipmentUserInclude,
		});

		return this.withPickupExpired(shipment);
	}

	async updateStatus(id: number, status: LoadBoardShipmentStatus) {
		const existing = await this.prisma.loadBoardShipment.findUnique({
			where: { id },
			select: {
				id: true,
				pickupEarliest: true,
				pickupLatest: true,
				pickupHours: true,
			},
		});
		if (!existing) {
			throw new NotFoundException('Shipment not found');
		}

		if (
			status === LoadBoardShipmentStatus.posted &&
			isLoadBoardPickupExpired({
				pickupEarliest: existing.pickupEarliest,
				pickupLatest: existing.pickupLatest,
				pickupHours: existing.pickupHours,
			})
		) {
			throw new BadRequestException(
				'Cannot post: pickup date/time has passed. Edit the shipment and update Pick up earliest / latest / hours first.',
			);
		}

		const nowNy = nowInNewYorkAsNaiveDate();
		const shipment = await this.prisma.loadBoardShipment.update({
			where: { id },
			data: {
				status,
				updatedAt: nowNy,
			},
			include: shipmentUserInclude,
		});

		return this.withPickupExpired(shipment);
	}

	async remove(id: number) {
		const existing = await this.prisma.loadBoardShipment.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!existing) {
			throw new NotFoundException('Shipment not found');
		}

		await this.prisma.loadBoardShipment.delete({ where: { id } });
		return { id };
	}

	/**
	 * Unpost all posted shipments whose pickup window has already passed.
	 * Used by cron and lazily before list responses.
	 */
	async unpostExpiredPostedShipments(): Promise<{ unpostedCount: number }> {
		const posted = await this.prisma.loadBoardShipment.findMany({
			where: { status: LoadBoardShipmentStatus.posted },
			select: {
				id: true,
				pickupEarliest: true,
				pickupLatest: true,
				pickupHours: true,
			},
		});

		const expiredIds = posted
			.filter((row) =>
				isLoadBoardPickupExpired({
					pickupEarliest: row.pickupEarliest,
					pickupLatest: row.pickupLatest,
					pickupHours: row.pickupHours,
				}),
			)
			.map((row) => row.id);

		if (expiredIds.length === 0) {
			return { unpostedCount: 0 };
		}

		const nowNy = nowInNewYorkAsNaiveDate();
		await this.prisma.loadBoardShipment.updateMany({
			where: {
				id: { in: expiredIds },
				status: LoadBoardShipmentStatus.posted,
			},
			data: {
				status: LoadBoardShipmentStatus.unposted,
				updatedAt: nowNy,
			},
		});

		for (const shipmentId of expiredIds) {
			this.loadBoardRealtimeService.emitShipmentUpdated(
				shipmentId,
				'unposted',
			);
		}

		return { unpostedCount: expiredIds.length };
	}

	async findAll(
		page = 1,
		limit = 10,
		ageSort: LoadBoardAgeSort = 'desc',
	) {
		await this.unpostExpiredPostedShipments();

		const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
		const safeLimit =
			Number.isFinite(limit) && limit > 0
				? Math.min(Math.floor(limit), 100)
				: 10;
		const skip = (safePage - 1) * safeLimit;
		const order: Prisma.SortOrder = ageSort === 'asc' ? 'asc' : 'desc';

		const [shipments, total] = await Promise.all([
			this.prisma.loadBoardShipment.findMany({
				skip,
				take: safeLimit,
				orderBy: [{ createdAt: order }, { id: order }],
				include: {
					...shipmentUserInclude,
					rateLoadBoards: {
						where: { active: true },
						orderBy: [{ id: 'asc' }],
						include: {
							driver: {
								select: {
									id: true,
									firstName: true,
									lastName: true,
									externalId: true,
								},
							},
						},
					},
				},
			}),
			this.prisma.loadBoardShipment.count(),
		]);

		const totalPages = Math.max(1, Math.ceil(total / safeLimit));

		return {
			shipments: shipments.map((s) => this.withPickupExpired(s)),
			pagination: {
				current_page: safePage,
				per_page: safeLimit,
				total_count: total,
				total_pages: totalPages,
				has_next_page: safePage < totalPages,
				has_prev_page: safePage > 1,
			},
		};
	}
}
