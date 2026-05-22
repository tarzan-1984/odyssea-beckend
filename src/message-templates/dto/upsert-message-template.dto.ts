import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpsertMessageTemplateDto {
	@ApiProperty({
		required: false,
		description:
			'When set, updates this template if it belongs to the current user.',
		example: 42,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	id?: number;

	@ApiProperty({
		required: false,
		enum: ['personal', 'company'],
		description:
			'Template category. Defaults to personal on create; omitted on update leaves type unchanged.',
		example: 'personal',
	})
	@IsOptional()
	@IsIn(['personal', 'company'])
	type?: 'personal' | 'company';

	@ApiProperty({ required: false, example: 'Pickup reminder' })
	@IsOptional()
	@IsString()
	@MaxLength(500)
	title?: string;

	@ApiProperty({ required: false, example: 'Hello, please confirm ETA.' })
	@IsOptional()
	@IsString()
	@MaxLength(20000)
	content?: string;
}
