import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class UpdateParticipantDto {
	@ApiProperty({ description: 'External ID of the participant', example: 'ext_user_123' })
	@IsString()
	id: string;

	@ApiProperty({ description: 'Role of the participant (case-insensitive)', example: 'DRIVER' })
	@IsString()
	role: string;
}

export class UpdateLoadChatDto {
	@ApiProperty({ description: 'Load ID used to find the chat', example: 'load_12345' })
	@IsString()
	load_id: string;

	@ApiProperty({ description: 'New list of participants (external IDs)', type: [UpdateParticipantDto] })
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => UpdateParticipantDto)
	participants: UpdateParticipantDto[];
}


