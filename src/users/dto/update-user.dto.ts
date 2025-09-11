import { ApiProperty } from '@nestjs/swagger';
import {
	IsEmail,
	IsString,
	IsEnum,
	IsOptional,
	MinLength,
	IsArray,
	IsBoolean,
	IsInt,
	Min,
	Max,
} from 'class-validator';
import { UserRole, VehicleType, DistanceCoverage } from '@prisma/client';

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
		description: 'User profile photo URL',
		example: 'https://example.com/photo.jpg',
		required: false,
	})
	@IsOptional()
	@IsString()
	profilePhoto?: string;

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
		description: 'Languages user speaks',
		example: ['English', 'Spanish'],
		required: false,
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	language?: string[];

	@ApiProperty({
		description: 'Phone extension for managers',
		example: '31',
		required: false,
	})
	@IsOptional()
	@IsString()
	extension?: string;

	// Address fields
	@ApiProperty({
		description: 'User location',
		example: 'New York, NY',
		required: false,
	})
	@IsOptional()
	@IsString()
	location?: string;

	@ApiProperty({
		description: 'Vehicle identification number',
		example: '1HGBH41JXMN109186',
		required: false,
	})
	@IsOptional()
	@IsString()
	vin?: string;

	@ApiProperty({
		description: 'Country',
		example: 'United States',
		required: false,
	})
	@IsOptional()
	@IsString()
	country?: string;

	@ApiProperty({
		description: 'City',
		example: 'New York',
		required: false,
	})
	@IsOptional()
	@IsString()
	city?: string;

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
		description: 'Tax ID number',
		example: '12-3456789',
		required: false,
	})
	@IsOptional()
	@IsString()
	taxId?: string;

	// Driver specific fields
	@ApiProperty({
		description: 'Vehicle type',
		enum: VehicleType,
		required: false,
	})
	@IsOptional()
	@IsEnum(VehicleType)
	vehicleType?: VehicleType;

	@ApiProperty({
		description: 'Vehicle brand',
		example: 'Ford',
		required: false,
	})
	@IsOptional()
	@IsString()
	vehicleBrand?: string;

	@ApiProperty({
		description: 'Vehicle model',
		example: 'Transit',
		required: false,
	})
	@IsOptional()
	@IsString()
	vehicleModel?: string;

	@ApiProperty({
		description: 'Vehicle year',
		example: 2020,
		required: false,
	})
	@IsOptional()
	@IsInt()
	@Min(1900)
	@Max(new Date().getFullYear())
	vehicleYear?: number;

	@ApiProperty({
		description: 'Vehicle capacity',
		example: '1000 lbs',
		required: false,
	})
	@IsOptional()
	@IsString()
	vehicleCapacity?: string;

	@ApiProperty({
		description: 'Vehicle dimensions',
		example: '10x6x6 ft',
		required: false,
	})
	@IsOptional()
	@IsString()
	vehicleDimensions?: string;

	@ApiProperty({
		description: 'Distance coverage preference',
		enum: DistanceCoverage,
		required: false,
	})
	@IsOptional()
	@IsEnum(DistanceCoverage)
	distanceCoverage?: DistanceCoverage;

	// Driver certifications and capabilities
	@ApiProperty({
		description: 'Has Commercial Driver License',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasCDL?: boolean;

	@ApiProperty({
		description: 'Can drive in Canada',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasCanada?: boolean;

	@ApiProperty({
		description: 'Can drive in Mexico',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasMexico?: boolean;

	@ApiProperty({
		description: 'Has dock high capability',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasDockHigh?: boolean;

	@ApiProperty({
		description: 'Has dolly capability',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasDolly?: boolean;

	@ApiProperty({
		description: 'Has E-tracks capability',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasETracks?: boolean;

	@ApiProperty({
		description: 'Has hazmat certification',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasHazmatCert?: boolean;

	@ApiProperty({
		description: 'Has lift gate capability',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasLiftGate?: boolean;

	@ApiProperty({
		description: 'Has load bars capability',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasLoadBars?: boolean;

	@ApiProperty({
		description: 'Has PPE equipment',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasPPE?: boolean;

	@ApiProperty({
		description: 'Has pallet jack capability',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasPalletJack?: boolean;

	@ApiProperty({
		description: 'Has printer capability',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasPrinter?: boolean;

	@ApiProperty({
		description: 'Has ramp capability',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasRamp?: boolean;

	@ApiProperty({
		description: 'Has Real ID',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasRealID?: boolean;

	@ApiProperty({
		description: 'Has sleeper capability',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasSleeper?: boolean;

	@ApiProperty({
		description: 'Has TSA certification',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasTSA?: boolean;

	@ApiProperty({
		description: 'Has TWIC certification',
		example: true,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasTWIC?: boolean;

	@ApiProperty({
		description: 'Has tanker endorsement',
		example: false,
		required: false,
	})
	@IsOptional()
	@IsBoolean()
	hasTankerEndorsement?: boolean;
}
