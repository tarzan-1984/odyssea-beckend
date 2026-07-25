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
	})
	@IsArray()
	@Type(() => Number)
	@IsInt({ each: true })
	trackings!: number[];

	@ApiProperty({
		example: [1015, 1088],
		description: 'loadIds to skip (no TRACKING replacement)',
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
		description: 'Per-dispatcher TRACKING membership updates',
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
