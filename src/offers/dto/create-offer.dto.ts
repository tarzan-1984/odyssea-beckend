import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsString,
	IsOptional,
	IsArray,
	IsNumber,
	Min,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

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
		description: 'Pick up location',
		example: 'New York, NY',
	})
	@IsString()
	pickUpLocation: string;

	@ApiProperty({
		description: 'Pick up time',
		example: '2025-02-15 08:00',
	})
	@IsString()
	pickUpTime: string;

	@ApiProperty({
		description: 'Delivery location',
		example: 'Boston, MA',
	})
	@IsString()
	deliveryLocation: string;

	@ApiProperty({
		description: 'Delivery time',
		example: '2025-02-16 14:00',
	})
	@IsString()
	deliveryTime: string;

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
		description: 'Empty miles (numeric or string)',
		example: 50.25,
	})
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	emptyMiles?: number;

	@ApiPropertyOptional({
		description: 'Total miles (numeric, can be computed from loaded + empty)',
		example: 200.75,
	})
	@IsOptional()
	@Transform(({ value }) => parseNumber(value))
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	totalMiles?: number;

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
}
