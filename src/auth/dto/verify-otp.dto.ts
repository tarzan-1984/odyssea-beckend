import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, IsEmail, IsNotEmpty } from 'class-validator';

export class VerifyOtpDto {
	@ApiProperty({
		example: 'user@example.com',
		description: 'User email address',
	})
	@IsNotEmpty()
	@IsEmail()
	email: string;

	@ApiProperty({
		example: '123456',
		description: '6-digit OTP code sent to email',
	})
	@IsNotEmpty()
	@IsString()
	@Length(6, 6)
	otp: string;
}
