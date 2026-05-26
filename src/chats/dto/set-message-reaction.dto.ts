import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SetMessageReactionDto {
	@ApiProperty({ example: '👍', description: 'Emoji reaction' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(32)
	emoji: string;
}
