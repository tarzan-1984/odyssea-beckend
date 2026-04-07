import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterMobileDeviceDto {
	@ApiProperty({
		example: 'ios',
		description: 'react-native Platform.OS',
	})
	@IsString()
	@IsNotEmpty()
	platform: string;

	@ApiPropertyOptional({ example: '1.2.3' })
	@IsOptional()
	@IsString()
	appVersion?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	deviceName?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	model?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	osVersion?: string;

	@ApiPropertyOptional({
		description:
			'Copy for analytics only; push delivery still uses push_tokens table',
	})
	@IsOptional()
	@IsString()
	pushToken?: string;
}
