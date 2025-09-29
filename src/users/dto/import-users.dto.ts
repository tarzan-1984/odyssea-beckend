import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ImportUsersDto {
	@ApiProperty({
		example: 1,
		description: 'Page number for external API pagination',
	})
	@IsInt()
	@Min(1)
	page: number;

	@ApiProperty({
		example: 30,
		description: 'Number of items per page for external API pagination',
	})
	@IsInt()
	@Min(1)
	per_page: number;

	@ApiProperty({
		example: 'John Doe',
		description: 'Search query for users (optional)',
		required: false,
	})
	@IsOptional()
	@IsString()
	search?: string;
}
