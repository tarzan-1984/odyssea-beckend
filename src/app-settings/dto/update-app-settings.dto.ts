import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min, ValidateBy } from 'class-validator';

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
			'Minimum distance (meters) the driver must move before a location send is allowed; must be a multiple of 5',
		example: 3000,
		minimum: 5,
	})
	@IsInt()
	@Min(5)
	@Max(1_000_000)
	@ValidateBy({
		name: 'locationMinDistanceM_multipleOf5',
		validator: {
			validate: (value: unknown): boolean =>
				typeof value === 'number' &&
				Number.isInteger(value) &&
				value >= 5 &&
				value <= 1_000_000 &&
				value % 5 === 0,
			defaultMessage: () =>
				'locationMinDistanceM must be between 5 and 1000000 and a multiple of 5',
		},
	})
	locationMinDistanceM!: number;
}
