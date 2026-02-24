import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsString,
	IsOptional,
	IsArray,
	IsNumber,
	Min,
	IsIn,
	ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/** Single route point (pick_up_location or delivery_location) */
export class RoutePointDto {
	@ApiProperty({
		description: 'Point type',
		enum: ['pick_up_location', 'delivery_location'],
		example: 'pick_up_location',
	})
	@IsIn(['pick_up_location', 'delivery_location'])
	type: 'pick_up_location' | 'delivery_location';

	@ApiProperty({ description: 'Location address', example: 'New York, NY' })
	@IsString()
	location: string;

	@ApiProperty({ description: 'Time', example: '2025-02-15 08:00' })
	@IsString()
	time: string;
}

function parseNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && !Number.isNaN(value)) return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value.replace(/,/g, '').trim());
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

export class CreateOfferDto {
	@ApiProperty({
		description: 'External ID of the user creating the offer (from hidden field)',
		example: 'ext_abc123',
	})
	@IsString()
	externalId: string;

	@ApiProperty({
		description:
			'Driver external IDs (from hidden field: array or comma-separated string)',
		example: ['ext_driver1', 'ext_driver2'],
		type: [String],
	})
	@Transform(({ value }) =>
		Array.isArray(value) ? value : String(value || '').split(',').map((s: string) => s.trim()).filter(Boolean),
	)
	@IsArray()
	@IsString({ each: true })
	driverIds: string[];

	@ApiProperty({
		description:
			'Route: array of points (pick_up_location / delivery_location) in order. Format: [{ type, location, time }, ...]',
		type: [RoutePointDto],
		example: [
			{ type: 'pick_up_location', location: 'Warehouse A', time: '08:00' },
			{ type: 'delivery_location', location: 'Site B', time: '14:00' },
		],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => RoutePointDto)
	route: RoutePointDto[];

	@ApiPropertyOptional({
		description: 'Loaded miles (numeric or string)',
		example: 150.5,
	})
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	loadedMiles?: number;

	@ApiPropertyOptional({
		description: 'Weight (numeric or string like "1,000 lbs")',
		example: 1000,
	})
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	weight?: number;

	@ApiPropertyOptional({
		description: 'Commodity description',
	})
	@IsOptional()
	@IsString()
	commodity?: string;

	@ApiPropertyOptional({
		description: 'Special requirements (array of option values)',
		example: ['hazmat', 'liftgate'],
		type: [String],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	specialRequirements?: string[];

	@ApiPropertyOptional({
		description: 'Notes (optional text)',
	})
	@IsOptional()
	@IsString()
	notes?: string;
}
