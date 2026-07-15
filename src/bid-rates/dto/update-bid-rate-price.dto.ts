import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateBidRatePriceDto {
	@ApiProperty({
		description:
			'Updated bid price. Stored in rate when there are no +1 participants, otherwise in new_price.',
		example: 3200,
	})
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	newPrice: number;
}
