import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class GetDriverLoadsDto {
	@ApiPropertyOptional({
		description:
			'Driver ID (filter by attached_driver / attached_second_driver)',
	})
	@IsOptional()
	@IsString()
	driver_id?: string;

	@ApiPropertyOptional({
		description:
			'Dispatcher user_id (filter by meta dispatcher_initials)',
	})
	@IsOptional()
	@IsString()
	user_id?: string;

	@ApiProperty({
		description: 'Project slug',
		enum: ['odysseia', 'martlet', 'endurance'],
	})
	@IsString()
	@IsIn(['odysseia', 'martlet', 'endurance'])
	project!: string;

	@ApiPropertyOptional({ description: 'true/false' })
	@IsOptional()
	@IsString()
	is_flt?: string;

	@ApiPropertyOptional({
		description: 'Exact load status (matches meta load_status)',
	})
	@IsOptional()
	@IsString()
	load_status?: string;

	@ApiPropertyOptional({
		description: 'date_created | date_updated | id | load_status',
	})
	@IsOptional()
	@IsString()
	sort_by?: string;

	@ApiPropertyOptional({ description: 'asc | desc' })
	@IsOptional()
	@IsString()
	sort_order?: string;

	@ApiPropertyOptional({ description: 'Page number (default: 1)' })
	@IsOptional()
	@IsString()
	page?: string;

	@ApiPropertyOptional({ description: 'Items per page (default: 20, max: 100)' })
	@IsOptional()
	@IsString()
	per_page?: string;
}

