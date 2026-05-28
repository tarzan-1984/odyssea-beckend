import { ApiProperty } from '@nestjs/swagger';
import {
	IsArray,
	IsInt,
	IsISO8601,
	IsOptional,
	IsString,
	ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TrackingTransferDto {
	@ApiProperty({ example: '2026-05-28T12:16:00+00:00', required: false })
	@IsOptional()
	@IsISO8601()
	ts?: string;

	@ApiProperty({ example: 'odysseia', required: false })
	@IsOptional()
	@IsString()
	project?: string;

	@ApiProperty({ example: 123, description: 'Driver externalId to replace' })
	@Type(() => Number)
	@IsInt()
	old_tracking!: number;

	@ApiProperty({ example: 456, description: 'Driver externalId to add' })
	@Type(() => Number)
	@IsInt()
	new_tracking!: number;

	@ApiProperty({ example: [2, 3, 10], required: false })
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	dispatchers?: number[];

	@ApiProperty({ example: [101, 102, 2050, 3333], description: 'TMS load ids' })
	@IsArray()
	@ArrayNotEmpty()
	@Type(() => Number)
	@IsInt({ each: true })
	id_loads!: number[];

	@ApiProperty({ example: 4, required: false })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	loads_count?: number;

	@ApiProperty({ example: 84, required: false })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	viewer_id?: number;

	@ApiProperty({ example: 1, required: false })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	doing_ajax?: number;

	@ApiProperty({ example: 'debug_save_weekends', required: false })
	@IsOptional()
	@IsString()
	action?: string;
}

