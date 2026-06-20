import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsString,
	IsOptional,
	IsArray,
	IsNumber,
	Min,
	IsIn,
	ValidateNested,
	IsNotEmpty,
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

	@ApiPropertyOptional({ description: 'Latitude from geocoding', example: 39.8083 })
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	latitude?: number;

	@ApiPropertyOptional({ description: 'Longitude from geocoding', example: -104.9339 })
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	longitude?: number;
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
		description:
			'TMS / user external id of the creator (stored as offers.external_user_id). Required.',
		example: '83',
	})
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim(),
	)
	@IsString()
	@IsNotEmpty({ message: 'externalId is required (creator external_user_id)' })
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
			{
				type: 'pick_up_location',
				location: 'Warehouse A',
				time: '08:00',
				latitude: 39.8083,
				longitude: -104.9339,
			},
			{
				type: 'delivery_location',
				location: 'Site B',
				time: '14:00',
				latitude: 38.5976,
				longitude: -80.4549,
			},
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
		description:
			'Map driverId -> empty_miles (rounded). Used for rate_offers: empty_miles per driver, total_miles = loaded_miles + empty_miles',
		example: { '123': 50, '456': 75 },
	})
	@IsOptional()
	driverEmptyMiles?: Record<string, number>;

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
