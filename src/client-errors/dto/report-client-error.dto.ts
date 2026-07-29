import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
	IsIn,
	IsObject,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';

export class ReportClientErrorDto {
	@ApiProperty({
		example: 'chat_photo_camera',
		description: 'Client feature / flow where the error happened',
	})
	@IsString()
	@MaxLength(120)
	feature: string;

	@ApiProperty({ example: 'manipulateAsync failed: Unable to load image' })
	@IsString()
	@MaxLength(2000)
	message: string;

	@ApiPropertyOptional({ example: 'prepare' })
	@IsOptional()
	@IsString()
	@MaxLength(80)
	stage?: string;

	@ApiPropertyOptional({
		example: 'info',
		description: 'error | warn | info (breadcrumbs use info)',
		enum: ['error', 'warn', 'info'],
	})
	@IsOptional()
	@IsString()
	@IsIn(['error', 'warn', 'info'])
	level?: 'error' | 'warn' | 'info';

	@ApiPropertyOptional({
		example: 'chat_m5x2k_ab12cd',
		description: 'Correlates steps of one client attach/upload attempt',
	})
	@IsOptional()
	@IsString()
	@MaxLength(80)
	flowId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(8000)
	stack?: string;

	@ApiPropertyOptional({ example: 'android' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	platform?: string;

	@ApiPropertyOptional({ example: '16' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	osVersion?: string;

	@ApiPropertyOptional({ example: 'SM-S928U1' })
	@IsOptional()
	@IsString()
	@MaxLength(120)
	model?: string;

	@ApiPropertyOptional({ example: "Omar's S24 Ultra" })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	deviceName?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(120)
	deviceId?: string;

	@ApiPropertyOptional({ example: '2.3.0' })
	@IsOptional()
	@IsString()
	@MaxLength(40)
	appVersion?: string;

	@ApiPropertyOptional({
		description: 'Extra diagnostic fields (mime, format, uri scheme, etc.)',
		type: 'object',
		additionalProperties: true,
	})
	@IsOptional()
	@IsObject()
	details?: Record<string, unknown>;
}
