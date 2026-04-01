import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateAppSettingsDto {
	@ApiProperty({
		description:
			'Minimum time between automatic driver location API sends (milliseconds)',
		example: 60000,
		minimum: 1000,
	})
	@IsInt()
	@Min(1000)
	@Max(86_400_000)
	locationMinIntervalMs!: number;

	@ApiProperty({
		description:
			'Minimum distance (meters) the driver must move before a location send is allowed',
		example: 3000,
		minimum: 1,
	})
	@IsInt()
	@Min(1)
	@Max(1_000_000)
	locationMinDistanceM!: number;
}
