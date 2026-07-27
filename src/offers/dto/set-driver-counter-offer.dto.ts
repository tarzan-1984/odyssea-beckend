import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class SetDriverCounterOfferDto {
	@ApiProperty({
		description:
			'Counter-offer amount proposed to the driver (USD). Must not be higher than the driver rate.',
		example: 2800,
	})
	@IsNumber()
	@Min(0)
	counterOffer: number;
}
