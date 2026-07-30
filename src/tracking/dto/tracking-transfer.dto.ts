import { ApiProperty } from '@nestjs/swagger';
import {
	IsArray,
	IsInt,
	IsISO8601,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TrackingTransferMembershipDto {
	@ApiProperty({
		example: 1,
		description: 'externalId of non-driver user (dispatcher)',
	})
	@Type(() => Number)
	@IsInt()
	dispatcher_id!: number;

	@ApiProperty({
		example: [2, 3],
		description: 'externalIds of non-driver TRACKING replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	tracking?: number[];

	/** @deprecated Prefer `tracking`. Kept for backward compatibility. */
	@ApiProperty({
		example: [2, 3],
		description: 'Alias of tracking (legacy)',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	trackings?: number[];

	@ApiProperty({
		example: [25],
		description: 'externalIds of non-driver MORNING_TRACKING replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	morning_tracking?: number[];

	@ApiProperty({
		example: [7],
		description: 'externalIds of non-driver NIGHTSHIFT_TRACKING replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	nightshift_tracking?: number[];

	@ApiProperty({
		example: [35],
		description: 'externalIds of non-driver TRACKING_TL_DAYTIME replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	'tracking-tl-daytime'?: number[];

	@ApiProperty({
		example: [37],
		description:
			'externalIds of non-driver TRACKING_TL_NIGHTSHIFT replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	'tracking-tl-nightshift'?: number[];

	@ApiProperty({
		example: [36],
		description:
			'externalIds of non-driver TRACKING_TL_MORNINGSHIFT replacements',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	'tracking-tl-morningshift'?: number[];

	@ApiProperty({
		example: [1015, 1088],
		description: 'loadIds to skip (no role replacement)',
		required: false,
	})
	@IsOptional()
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	exclude_loads?: number[];
}

export class TrackingTransferDto {
	@ApiProperty({ example: '2026-07-25T13:21:00+00:00', required: false })
	@IsOptional()
	@IsISO8601()
	ts?: string;

	@ApiProperty({ example: 'Odysseia' })
	@IsString()
	project!: string;

	@ApiProperty({
		example: 'manage_teams_save',
		required: false,
	})
	@IsOptional()
	@IsString()
	source?: string;

	@ApiProperty({ example: 99, required: false })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	viewer_id?: number;

	@ApiProperty({
		type: [TrackingTransferMembershipDto],
		description: 'Per-dispatcher role membership updates',
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => TrackingTransferMembershipDto)
	memberships!: TrackingTransferMembershipDto[];

	@ApiProperty({ example: 1, required: false })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	doing_ajax?: number;

	@ApiProperty({
		example: 'save_manage_teams',
		description: 'Stored in load_chats_logs.action',
	})
	@IsString()
	action!: string;
}
