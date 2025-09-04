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
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UserRole, VehicleType, DistanceCoverage } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'password123',
    minLength: 6,
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'John',
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
  })
  @IsEnum(UserRole)
  role: UserRole;

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
  })
  @IsNotEmpty()
  @IsString()
  taxId: string;

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
    description: 'Vehicle cargo capacity',
    example: '2000 lbs',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleCapacity?: string;

  @ApiProperty({
    description: 'Vehicle cargo compartment dimensions',
    example: '10x8x6 feet',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleDimensions?: string;

  @ApiProperty({
    description: 'Vehicle model',
    example: 'Sprinter 2500',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @ApiProperty({
    description: 'Vehicle brand',
    example: 'Mercedes-Benz',
    required: false,
  })
  @IsOptional()
  @IsString()
  vehicleBrand?: string;

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
    description: 'Distance coverage',
    enum: DistanceCoverage,
    required: false,
  })
  @IsOptional()
  @IsEnum(DistanceCoverage)
  distanceCoverage?: DistanceCoverage;

  // Equipment and certificates
  @ApiProperty({
    description: 'Has pallet jack',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasPalletJack?: boolean;

  @ApiProperty({
    description: 'Has lift gate',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasLiftGate?: boolean;

  @ApiProperty({
    description: 'Has CDL license',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasCDL?: boolean;

  @ApiProperty({
    description: 'Has TWIC card',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasTWIC?: boolean;

  @ApiProperty({
    description: 'Has TSA clearance',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasTSA?: boolean;

  @ApiProperty({
    description: 'Has hazmat certificate',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasHazmatCert?: boolean;

  @ApiProperty({
    description: 'Has tanker endorsement',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasTankerEndorsement?: boolean;

  @ApiProperty({
    description: 'Has dolly',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasDolly?: boolean;

  @ApiProperty({
    description: 'Can drive to Canada',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasCanada?: boolean;

  @ApiProperty({
    description: 'Can drive to Mexico',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasMexico?: boolean;

  @ApiProperty({
    description: 'Has E-tracks',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasETracks?: boolean;

  @ApiProperty({
    description: 'Has load bars',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasLoadBars?: boolean;

  @ApiProperty({
    description: 'Has ramp',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasRamp?: boolean;

  @ApiProperty({
    description: 'Has dock high capability',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasDockHigh?: boolean;

  @ApiProperty({
    description: 'Has PPE',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasPPE?: boolean;

  @ApiProperty({
    description: 'Has Real ID',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasRealID?: boolean;

  @ApiProperty({
    description: 'Has printer',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasPrinter?: boolean;

  @ApiProperty({
    description: 'Has sleeper',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  hasSleeper?: boolean;
}
