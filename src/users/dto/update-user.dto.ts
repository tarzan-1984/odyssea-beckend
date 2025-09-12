import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsString,
	IsEnum,
	IsOptional,
	MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
	@ApiProperty({
		description: 'User email address',
		example: 'user@example.com',
		required: false,
	})
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({
		description: 'User password',
		example: 'password123',
		minLength: 6,
		required: false,
	})
	@IsOptional()
	@IsString()
	@MinLength(6)
	password?: string;

	@ApiProperty({
		description: 'User first name',
		example: 'John',
		required: false,
	})
	@IsOptional()
	@IsString()
	firstName?: string;

	@ApiProperty({
		description: 'User last name',
		example: 'Doe',
		required: false,
	})
	@IsOptional()
	@IsString()
	lastName?: string;

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
		required: false,
	})
	@IsOptional()
	@IsEnum(UserRole)
	role?: UserRole;

	@ApiProperty({
		description: 'User profile photo URL',
		example: 'https://example.com/photo.jpg',
		required: false,
	})
	@IsOptional()
	@IsString()
	profilePhoto?: string;

	@ApiProperty({
		description: 'User location',
		example: 'New York, NY',
		required: false,
	})
	@IsOptional()
	@IsString()
	location?: string;

	@ApiProperty({
		description: 'State/Province',
		example: 'NY',
		required: false,
	})
	@IsOptional()
	@IsString()
	state?: string;

	@ApiProperty({
		description: 'ZIP/Postal code',
		example: '10001',
		required: false,
	})
	@IsOptional()
	@IsString()
	zip?: string;

	@ApiProperty({
		description: 'City',
		example: 'New York',
		required: false,
	})
	@IsOptional()
	@IsString()
	city?: string;

	@ApiProperty({
		description: 'External ID from external service',
		example: 'ext_123456',
		required: false,
	})
	@IsOptional()
	@IsString()
	externalId?: string;
}
