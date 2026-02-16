import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class GetOffersQueryDto {
	@ApiPropertyOptional({
		description: 'Page number (1-based)',
		example: 1,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number = 1;

	@ApiPropertyOptional({
		description: 'Number of items per page',
		example: 10,
		minimum: 1,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 10;

	@ApiPropertyOptional({
		description:
			'Filter by expiration: true = only expired (action_time < now NY), false = only not expired (action_time >= now NY)',
		example: false,
	})
	@IsOptional()
	@Transform(({ value }) => {
		if (value === true || value === 'true') return true;
		if (value === false || value === 'false') return false;
		return undefined;
	})
	@IsBoolean()
	is_expired?: boolean;

	@ApiPropertyOptional({
		description: 'Filter by external_user_id',
		example: 'user-123',
	})
	@IsOptional()
	@IsString()
	user_id?: string;

	@ApiPropertyOptional({
		description: 'Sort by action_time: action_time_asc (soonest to expire first, default), action_time_desc',
		example: 'action_time_asc',
		enum: ['action_time_asc', 'action_time_desc'],
	})
	@IsOptional()
	@IsIn(['action_time_asc', 'action_time_desc'])
	sort_order?: 'action_time_asc' | 'action_time_desc';
}
