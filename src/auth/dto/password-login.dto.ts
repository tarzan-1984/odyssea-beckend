import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsBoolean, IsOptional } from 'class-validator';

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

  @ApiPropertyOptional({
  description: 'Optional flag to indicate mobile client; when true, driver role is allowed',
  default: false,
  })
  @IsOptional()
  @IsBoolean()
  isMobile?: boolean;
}
