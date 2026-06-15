import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** Optional device snapshot on GET /app-settings (records per-device last active time). */
export class MobileDeviceSyncQueryDto {
	@ApiPropertyOptional({
		description:
			'Stable per-installation device id (react-native-device-info unique id)',
	})
	@IsOptional()
	@IsString()
	deviceId?: string;

	@ApiPropertyOptional({ example: 'ios' })
	@IsOptional()
	@IsString()
	platform?: string;

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
		description: 'Analytics copy; push delivery uses push_tokens',
	})
	@IsOptional()
	@IsString()
	pushToken?: string;
}
