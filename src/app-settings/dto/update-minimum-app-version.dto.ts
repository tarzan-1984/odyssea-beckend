import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

/** Empty string disables the server-side minimum version gate. */
const MIN_APP_VERSION_PATTERN = /^$|^\d+(?:\.\d+)+(?:[-\w.]*)?$/u;

export class UpdateMinimumAppVersionDto {
	@ApiProperty({
		description:
			'Minimum required mobile app version (e.g. 2.1.4). Empty string disables enforcement.',
		example: '2.1.4',
	})
	@IsString()
	@MaxLength(32)
	@Matches(MIN_APP_VERSION_PATTERN, {
		message:
			'minimumAppVersion must be empty or a dotted version like 2.1.4',
	})
	minimumAppVersion!: string;
}
