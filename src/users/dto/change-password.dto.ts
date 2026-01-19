import { IsNotEmpty, IsString } from 'class-validator';

export class ChangePasswordDto {
	@IsString()
	@IsNotEmpty()
	newPassword: string;
}
