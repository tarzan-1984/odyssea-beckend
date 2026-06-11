import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize, IsOptional, IsObject } from 'class-validator';
import { Transform } from 'class-transformer';

export class AddDriversToOfferDto {
	@ApiProperty({
		description: 'Array of driver IDs (externalId or User id) to add to the offer',
		example: ['3914', '3915'],
		type: [String],
	})
	@Transform(({ value }) =>
		Array.isArray(value)
			? value.map((s: unknown) => String(s).trim()).filter(Boolean)
			: [],
	)
	@IsArray()
	@IsString({ each: true })
	@ArrayMinSize(1, { message: 'At least one driver ID is required' })
	driverIds: string[];

	@ApiPropertyOptional({
		description:
			'Map driverId -> empty_miles (rounded). Used for rate_offers: empty_miles per driver, total_miles = offer.loaded_miles + empty_miles',
		example: { '123': 50, '456': 75 },
	})
	@IsOptional()
	@IsObject()
	driverEmptyMiles?: Record<string, number>;
}
