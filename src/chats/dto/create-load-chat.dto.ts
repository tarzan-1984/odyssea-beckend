import { IsString, IsArray, ValidateNested, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class ParticipantDto {
	@ApiProperty({
		description: 'External ID of the participant',
		example: 'ext_user_123',
	})
	@IsString()
	id: string;

	@ApiProperty({
		description: 'Role of the participant (case-insensitive)',
		example: 'DRIVER',
	})
	@IsString()
	role: string;
}

export class CreateLoadChatDto {
	@ApiProperty({
		description: 'Load ID',
		example: 'load_12345',
	})
	@IsString()
	load_id: string;

	@ApiProperty({
		description: 'Chat title',
		example: 'Load #12345 Discussion',
	})
	@IsString()
	title: string;

	@ApiProperty({
		description: 'Company identifier for the LOAD chat',
		enum: ['Odysseia', 'Martlet', 'Endurance'],
		example: 'Odysseia',
	})
	@IsEnum(['Odysseia', 'Martlet', 'Endurance'])
	company: 'Odysseia' | 'Martlet' | 'Endurance';

	@ApiProperty({
		description: 'Array of participants with their IDs and roles',
		type: [ParticipantDto],
		example: [
			{ id: 'ext_driver_1', role: 'DRIVER' },
			{ id: 'ext_dispatcher_1', role: 'DISPATCHER' },
		],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ParticipantDto)
	participants: ParticipantDto[];

	@ApiPropertyOptional({
		description:
			'Optional dispatch text inserted as a system message right after the LOAD chat is created. Ignored when empty.',
		example: 'Please confirm pickup by 3 PM.',
	})
	@IsOptional()
	@IsString()
	dispatch_message?: string;
}

