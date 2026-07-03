import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class EmailOnlyLoginDto {
	@ApiProperty({
		example: 'user@example.com',
		description: 'User email address',
	})
	@IsEmail()
	email: string;

	@ApiPropertyOptional({
		description:
			'Stable per-installation device id — used to block sign-in from blocked devices',
	})
	@IsOptional()
	@IsString()
	deviceId?: string;
}
