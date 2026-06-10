import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class SetDriverPasswordDto {
	@IsString()
	@IsNotEmpty()
	externalId: string;

	@IsString()
	@IsNotEmpty()
	@MinLength(6, { message: 'Password must be at least 6 characters long' })
	password: string;

	@IsString()
	@IsNotEmpty()
	@Matches(/^\d+$/, { message: 'OTP must contain digits only' })
	otp: string;
}
