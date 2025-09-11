import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, IsNotEmpty } from 'class-validator';

export class ResetPasswordDto {
	@ApiProperty({
		description: 'Password reset token',
		example: 'abc123def456',
	})
	@IsNotEmpty()
	@IsString()
	token: string;

	@ApiProperty({
		description: 'New password',
		example: 'newpassword123',
		minLength: 6,
	})
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	newPassword: string;
}
