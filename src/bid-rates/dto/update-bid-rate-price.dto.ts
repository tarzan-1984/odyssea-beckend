import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateBidRatePriceDto {
	@ApiProperty({
		description:
			'Updated bid price. Non-owner: bid_rate_participants.rate + created_rate_at for the requester. Owner: bid_rates.rate when no +1 timers are active; otherwise bid_rate_participants.rate for the owner.',
		example: 3200,
	})
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	newPrice: number;
}
