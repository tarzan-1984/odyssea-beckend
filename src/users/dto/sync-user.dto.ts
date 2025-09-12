import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsString,
	IsEnum,
	IsNotEmpty,
	IsOptional,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class SyncUserDto {
	@ApiProperty({
		description: 'External ID from external service (unique identifier)',
		example: 'ext_123456',
	})
	@IsNotEmpty()
	@IsString()
	externalId: string;

	@ApiProperty({
		description: 'User email address',
		example: 'user@example.com',
	})
	@IsNotEmpty()
	@IsEmail()
	email: string;

	@ApiProperty({
		description: 'User first name',
		example: 'John',
	})
	@IsNotEmpty()
	@IsString()
	firstName: string;

	@ApiProperty({
		description: 'User last name',
		example: 'Doe',
	})
	@IsNotEmpty()
	@IsString()
	lastName: string;

	@ApiProperty({
		description: 'User phone number',
		example: '+1234567890',
		required: false,
	})
	@IsOptional()
	@IsString()
	phone?: string;

	@ApiProperty({
		description: 'User role',
		enum: UserRole,
		example: UserRole.DRIVER,
	})
	@IsEnum(UserRole)
	role: UserRole;
}
