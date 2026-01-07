import { ApiProperty } from '@nestjs/swagger';
import {
	IsString,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsObject,
	ValidateNested,
	IsArray,
	IsNumber,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum WebhookType {
	ADD = 'add',
	UPDATE = 'update',
	DELETE = 'delete',
}

export enum WebhookRole {
	DRIVER = 'driver',
	EMPLOYEE = 'employee',
}

export class DriverData {
	@ApiProperty({
		description: 'Driver ID from external service',
		example: '3343',
	})
	@IsNotEmpty()
	@IsString()
	driver_id: string;

	@ApiProperty({
		description: 'Driver full name',
		example: 'Test Driver 2',
	})
	@IsNotEmpty()
	@IsString()
	driver_name: string;

	@ApiProperty({
		description: 'Driver email',
		example: 'tdev13105@gmail.com',
	})
	@IsNotEmpty()
	@IsString()
	driver_email: string;

	@ApiProperty({
		description: 'Driver phone number',
		example: '(013) 242-3423',
	})
	@IsOptional()
	@IsString()
	driver_phone?: string;

	@ApiProperty({
		description: 'Driver home location',
		example: 'NM',
	})
	@IsOptional()
	@IsString()
	home_location?: string;

	@ApiProperty({
		description: 'Vehicle type',
		example: 'sprinter-van',
	})
	@IsOptional()
	@IsString()
	vehicle_type?: string;

	@ApiProperty({
		description: 'Vehicle VIN',
		example: '44444421224',
	})
	@IsOptional()
	@IsString()
	vin?: string;

	@ApiProperty({
		description: 'Driver status',
		example: 'available',
		required: false,
	})
	@IsOptional()
	@IsString()
	driver_status?: string;

	@ApiProperty({
		description: 'Status date',
		example: '2025-01-07',
		required: false,
	})
	@IsOptional()
	@IsString()
	status_date?: string;

	@ApiProperty({
		description: 'Current location',
		example: 'Los Angeles',
		required: false,
	})
	@IsOptional()
	@IsString()
	current_location?: string;

	@ApiProperty({
		description: 'Current city',
		example: 'Los Angeles',
		required: false,
	})
	@IsOptional()
	@IsString()
	current_city?: string;

	@ApiProperty({
		description: 'Current zipcode',
		example: '90001',
		required: false,
	})
	@IsOptional()
	@IsString()
	current_zipcode?: string;

	@ApiProperty({
		description: 'Current country',
		example: 'USA',
		required: false,
	})
	@IsOptional()
	@IsString()
	current_country?: string;

	@ApiProperty({
		description: 'Driver latitude coordinate',
		example: 34.14633,
		required: false,
	})
	@IsOptional()
	@IsNumber()
	@Transform(({ value }) => {
		if (typeof value === 'string') {
			const parsed = parseFloat(value);
			return Number.isNaN(parsed) ? null : parsed;
		}
		return typeof value === 'number' ? value : null;
	})
	latitude?: number;

	@ApiProperty({
		description: 'Driver longitude coordinate',
		example: -118.24864,
		required: false,
	})
	@IsOptional()
	@IsNumber()
	@Transform(({ value }) => {
		if (typeof value === 'string') {
			const parsed = parseFloat(value);
			return Number.isNaN(parsed) ? null : parsed;
		}
		return typeof value === 'number' ? value : null;
	})
	longitude?: number;
}

export class AcfFields {
	@ApiProperty({
		description: 'Permission view array',
		example: ['Odysseia', 'Martlet', 'Endurance'],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	permission_view?: string[];

	@ApiProperty({
		description: 'Initials color',
		example: '#0d6efd',
	})
	@IsOptional()
	@IsString()
	initials_color?: string;

	@ApiProperty({
		description: 'Work location',
		example: 'pl',
	})
	@IsOptional()
	@IsString()
	work_location?: string;

	@ApiProperty({
		description: 'Phone number',
		example: '(667) 290-9332',
	})
	@IsOptional()
	@IsString()
	phone_number?: string;

	@ApiProperty({
		description: 'FLT flag',
		example: false,
	})
	@IsOptional()
	flt?: boolean;

	@ApiProperty({
		description: 'Deactivate account flag from TMS',
		example: true,
	})
	@IsOptional()
	deactivate_account?: boolean;
}

export class UserData {
	@ApiProperty({
		description: 'User ID from external service',
		example: 33,
	})
	@IsNotEmpty()
	id: number;

	@ApiProperty({
		description: 'User email',
		example: 'milchenko2k16+11111222@gmail.com',
	})
	@IsNotEmpty()
	@IsString()
	user_email: string;

	@ApiProperty({
		description: 'Display name',
		example: 'Serhii Milchenko',
	})
	@IsNotEmpty()
	@IsString()
	display_name: string;

	@ApiProperty({
		description: 'First name',
		example: 'Serhii',
	})
	@IsNotEmpty()
	@IsString()
	first_name: string;

	@ApiProperty({
		description: 'Last name',
		example: 'Milchenko',
	})
	@IsNotEmpty()
	@IsString()
	last_name: string;

	@ApiProperty({
		description: 'User roles',
		example: ['dispatcher'],
	})
	@IsNotEmpty()
	@IsArray()
	@IsString({ each: true })
	roles: string[];

	@ApiProperty({
		description: 'User registration date',
		example: '2025-09-12 08:14:45',
	})
	@IsOptional()
	@IsString()
	user_registered?: string;

	@ApiProperty({
		description: 'ACF fields',
		type: AcfFields,
	})
	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => AcfFields)
	acf_fields?: AcfFields;
}

export class WebhookSyncDto {
	@ApiProperty({
		description: 'Webhook type',
		enum: WebhookType,
		example: WebhookType.ADD,
	})
	@IsNotEmpty()
	@IsEnum(WebhookType)
	type: WebhookType;

	@ApiProperty({
		description: 'User role',
		enum: WebhookRole,
		example: WebhookRole.DRIVER,
	})
	@IsNotEmpty()
	@IsEnum(WebhookRole)
	role: WebhookRole;

	@ApiProperty({
		description: 'Timestamp',
		example: '2025-09-12 04:31:45',
	})
	@IsNotEmpty()
	@IsString()
	timestamp: string;

	@ApiProperty({
		description: 'Source system',
		example: 'tms-statistics',
	})
	@IsNotEmpty()
	@IsString()
	source: string;

	@ApiProperty({
		description: 'Driver data (for driver role)',
		type: DriverData,
		required: false,
	})
	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => DriverData)
	driver_data?: DriverData;

	@ApiProperty({
		description: 'User data (for employee role)',
		type: UserData,
		required: false,
	})
	@IsOptional()
	@IsObject()
	@ValidateNested()
	@Type(() => UserData)
	user_data?: UserData;

	@ApiProperty({
		description: 'Driver ID (for delete operations)',
		example: '122',
		required: false,
	})
	@IsOptional()
	@IsString()
	driver_id?: string;

	@ApiProperty({
		description: 'User ID (for delete operations)',
		example: 29,
		required: false,
	})
	@IsOptional()
	user_id?: number;
}
