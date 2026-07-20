import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class VoteBidOfferDto {
	@ApiProperty({
		description: 'true = accept offer, false = reject offer',
		example: true,
	})
	@IsBoolean()
	accept: boolean;
}
