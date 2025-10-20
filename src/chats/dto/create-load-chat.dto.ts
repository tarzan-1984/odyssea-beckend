import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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
}

