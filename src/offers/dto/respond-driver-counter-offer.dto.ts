import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class RespondDriverCounterOfferDto {
	@ApiProperty({
		description: 'Accept applies counter_offer as the new driver rate; decline clears it.',
		enum: ['accept', 'decline'],
		example: 'accept',
	})
	@IsIn(['accept', 'decline'])
	action: 'accept' | 'decline';
}
