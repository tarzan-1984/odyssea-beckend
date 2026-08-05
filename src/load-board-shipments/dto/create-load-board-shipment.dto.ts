import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	LoadBoardEquipment,
	LoadBoardLoadType,
	LoadBoardShipmentStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { RoutePointDto } from '../../offers/dto/create-offer.dto';

export class CreateLoadBoardShipmentDto {
	@ApiProperty({
		description:
			'Route: array of points (pick_up_location / delivery_location) in order, same format as offers.route',
		type: [RoutePointDto],
	})
	@IsArray()
	@ArrayMinSize(2)
	@ValidateNested({ each: true })
	@Type(() => RoutePointDto)
	route: RoutePointDto[];

	@ApiProperty({ example: '03/15/2026', description: 'Pick up earliest date (required)' })
	@IsString()
	@IsNotEmpty()
	pickupEarliest: string;

	@ApiPropertyOptional({ example: '03/16/2026' })
	@IsOptional()
	@IsString()
	pickupLatest?: string;

	@ApiPropertyOptional({ example: '08:00 am' })
	@IsOptional()
	@IsString()
	pickupHours?: string;

	@ApiPropertyOptional({ example: '05:00 pm' })
	@IsOptional()
	@IsString()
	dropOffHours?: string;

	@ApiProperty({ example: 1200, description: 'Freight weight in lbs' })
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	weight: number;

	@ApiProperty({ example: 'Electronics', maxLength: 100 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	commodity: string;

	@ApiPropertyOptional({
		description: 'Special instruction slugs (same set as offer special requirements)',
		type: [String],
		example: ['liftgate', 'hazmat'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	specialInstructions?: string[];

	@ApiProperty({ enum: LoadBoardLoadType, example: LoadBoardLoadType.full })
	@IsEnum(LoadBoardLoadType)
	loadType: LoadBoardLoadType;

	@ApiProperty({ enum: LoadBoardEquipment, example: LoadBoardEquipment.cargo_van })
	@IsEnum(LoadBoardEquipment)
	equipment: LoadBoardEquipment;

	@ApiPropertyOptional({
		description: 'Equipment length in feet (for box_truck / dry_van)',
		example: 26,
	})
	@ValidateIf(
		(o: CreateLoadBoardShipmentDto) =>
			o.equipment === LoadBoardEquipment.box_truck ||
			o.equipment === LoadBoardEquipment.dry_van,
	)
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	equipmentLength?: number;

	@ApiPropertyOptional({
		description: 'Equipment weight capacity in lbs (for box_truck / dry_van)',
		example: 10000,
	})
	@ValidateIf(
		(o: CreateLoadBoardShipmentDto) =>
			o.equipment === LoadBoardEquipment.box_truck ||
			o.equipment === LoadBoardEquipment.dry_van,
	)
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	equipmentWeight?: number;

	@ApiPropertyOptional({ example: 'Handle with care', maxLength: 140 })
	@IsOptional()
	@IsString()
	@MaxLength(140)
	comments?: string;

	@ApiPropertyOptional({ example: 'REF-12345' })
	@IsOptional()
	@IsString()
	referenceId?: string;

	@ApiPropertyOptional({ example: 2500, description: 'Optional estimated rate' })
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	rate?: number;

	@ApiPropertyOptional({
		enum: LoadBoardShipmentStatus,
		example: LoadBoardShipmentStatus.posted,
		default: LoadBoardShipmentStatus.posted,
	})
	@IsOptional()
	@IsEnum(LoadBoardShipmentStatus)
	status?: LoadBoardShipmentStatus;
}
