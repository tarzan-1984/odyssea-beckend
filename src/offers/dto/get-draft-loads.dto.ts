import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class GetDraftLoadsDto {
	@ApiProperty({
		description: 'Project slug',
		enum: ['odysseia', 'martlet', 'endurance'],
	})
	@IsIn(['odysseia', 'martlet', 'endurance'])
	project!: 'odysseia' | 'martlet' | 'endurance';

	@ApiPropertyOptional({ description: 'Page number (default: 1)' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({ description: 'Items per page (default: 20, max: 100)' })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	per_page?: number;

	@ApiPropertyOptional({ description: 'true/false (TMS flag)' })
	@IsOptional()
	@IsIn(['true', 'false'])
	is_flt?: 'true' | 'false';
}

