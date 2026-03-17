import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class ExtendDriverTimeDto {
	@ApiProperty({
		description:
			'Additional minutes to add to the later of current action_time or current Unix time, where action_time is stored in Unix seconds',
		example: 15,
	})
	@IsNumber()
	@Min(1)
	extendTimeMinutes: number;
}
