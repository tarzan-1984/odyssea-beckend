import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
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
}
