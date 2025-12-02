import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateUserLocationDto {
  @ApiProperty({
    description: 'Human readable location string (e.g. "City, State ZIP, Country")',
    example: 'Nikolaev, Mykolaiv 54000, Ukraine',
    required: false,
  })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({
    description: 'City name',
    example: 'Nikolaev',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description: 'State / region code',
    example: 'Mykolaiv',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({
    description: 'ZIP / postal code',
    example: '54000',
    required: false,
  })
  @IsOptional()
  @IsString()
  zip?: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 46.948524,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: 31.941773,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({
    description: 'Client-side timestamp of the last location update (ISO string)',
    example: '2025-12-02T19:05:20.818Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  lastLocationUpdateAt?: string;
}


