import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';

class UpdateParticipantDto {
	@ApiProperty({ description: 'External ID of the participant', example: 'ext_user_123' })
	@IsString()
	id: string;

	@ApiProperty({ description: 'Role of the participant (case-insensitive)', example: 'DRIVER' })
	@IsString()
	role: string;
}

export class UpdateLoadChatDto {
	@ApiProperty({ description: 'Load ID used to find / create LOAD chats', example: 'load_12345' })
	@IsString()
	load_id: string;

	@ApiPropertyOptional({
		description:
			'Base chat title used when creating a missing per-driver LOAD chat. If omitted, taken from an existing LOAD chat for this load_id.',
		example: '160134 Aurora IL - MISSISSAUGA, ON',
	})
	@IsOptional()
	@IsString()
	title?: string;

	@ApiPropertyOptional({
		description:
			'Company for newly created LOAD chats. If omitted, taken from an existing LOAD chat for this load_id.',
		enum: ['Odysseia', 'Martlet', 'Endurance'],
		example: 'Odysseia',
	})
	@IsOptional()
	@IsEnum(['Odysseia', 'Martlet', 'Endurance'])
	company?: 'Odysseia' | 'Martlet' | 'Endurance';

	@ApiProperty({
		description:
			'Participants. Every DRIVER without an existing LOAD chat for this load_id gets a new chat; drivers that already have a chat are left untouched. Non-drivers are copied into newly created chats.',
		type: [UpdateParticipantDto],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateParticipantDto)
	participants: UpdateParticipantDto[];
}
