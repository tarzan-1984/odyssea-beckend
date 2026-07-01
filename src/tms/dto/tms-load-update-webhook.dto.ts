import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TmsLoadUpdateWebhookDto {
	@ApiProperty({
		description: 'TMS load id',
		example: '12345',
	})
	@Transform(({ value }) =>
		value == null || value === '' ? '' : String(value).trim(),
	)
	@IsString()
	@IsNotEmpty()
	load_id!: string;

	@ApiPropertyOptional({
		description: 'TMS project slug',
		example: 'beck',
	})
	@Transform(({ value }) =>
		value == null || value === '' ? undefined : String(value).trim(),
	)
	@IsOptional()
	@IsString()
	project?: string;

	@ApiPropertyOptional({
		description: 'FLT filter flag from TMS',
		example: false,
	})
	@IsOptional()
	@IsBoolean()
	is_flt?: boolean;
}
