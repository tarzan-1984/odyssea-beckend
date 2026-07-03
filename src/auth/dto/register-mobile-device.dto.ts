import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterMobileDeviceDto {
	@ApiPropertyOptional({
		example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
		description:
			'Stable per-installation device id (react-native-device-info unique id). Omit on legacy app builds.',
	})
	@IsOptional()
	@IsString()
	deviceId?: string;

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

	@ApiPropertyOptional({
		description:
			'When true (after login), re-activates a previously removed device. Background sync must omit this.',
	})
	@IsOptional()
	@IsBoolean()
	reactivate?: boolean;
}
