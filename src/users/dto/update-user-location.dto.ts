import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

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
    description:
      'City name (ignored when latitude/longitude are sent — server resolves city/state/zip from coordinates)',
    example: 'Nikolaev',
    required: false,
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({
    description:
      'State / region (ignored when latitude/longitude are sent — server resolves address from coordinates)',
    example: 'Mykolaiv',
    required: false,
  })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiProperty({
    description:
      'ZIP / postal code (ignored when latitude/longitude are sent — server resolves address from coordinates)',
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
    description: 'Client-side local timestamp of the last location update (as string, without timezone shift)',
    example: '2025-12-02T22:05:20.818',
    required: false,
  })
  @IsOptional()
  @IsString()
  lastLocationUpdateAt?: string;

  @ApiProperty({
    description:
      'Driver status for DB + TMS (omit on background-only pings to avoid overwriting)',
    example: 'available',
    required: false,
  })
  @IsOptional()
  @IsString()
  driverStatus?: string;

  @ApiProperty({
    description:
      'Status date/time string for DB + TMS (e.g. MM/DD/YY h:mm AM/PM); omit with driverStatus if unchanged',
    required: false,
  })
  @IsOptional()
  @IsString()
  statusDate?: string;

  @ApiProperty({
    description: 'Country for TMS payload (default USA)',
    example: 'USA',
    required: false,
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({
    description:
      'Auto-update toggle state (mirrors app automaticLocationSharing setting)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isAutoupdate?: boolean;

  @ApiProperty({
    description:
      'True when the request is from the mobile background location task (automatic pings). Skips TMS driver/location sync on the server; DB and WebSocket still update.',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isBackgroundTaskLocationUpdate?: boolean;

  @ApiProperty({
    description:
      'True only when the driver explicitly submitted the status form or pressed Share location. Used for server logs; omit for automatic/legacy client sends.',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isManualDriverLocationAction?: boolean;
}


