import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateAppSettingsDto {
	@ApiProperty({
		description:
			'Minimum time between automatic driver location API sends (milliseconds). Use 0 to disable the time gate (testing / max frequency allowed by OS throttles).',
		example: 60000,
		minimum: 0,
	})
	@IsInt()
	@Min(0)
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

	@ApiProperty({
		description:
			'Minimum straight-line meters from last successful reverse geocode before resolving ZIP/city/state again (background task)',
		example: 5000,
		minimum: 100,
	})
	@IsInt()
	@Min(100)
	@Max(500_000)
	reverseGeocodeMinDistanceM!: number;
}
