import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class PasswordLoginDto {
	@ApiProperty({
		example: 'user@example.com',
		description: 'User email address',
	})
	@IsEmail()
	email: string;

	@ApiProperty({
		example: 'password123',
		description: 'User password',
		minLength: 6,
	})
	@IsString()
	@MinLength(6)
	password: string;
}
