import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class ExtendDriverTimeDto {
	@ApiProperty({
		description: 'Additional minutes to add to the existing action_time',
		example: 15,
	})
	@IsNumber()
	@Min(1)
	extendTimeMinutes: number;
}
