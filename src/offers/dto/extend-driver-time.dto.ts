import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class ExtendDriverTimeDto {
	@ApiProperty({
		description:
			'Additional minutes to add to the later of current action_time_unix or current Unix time',
		example: 15,
	})
	@IsNumber()
	@Min(1)
	extendTimeMinutes: number;
}
