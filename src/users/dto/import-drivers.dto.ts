import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ImportDriversDto {
  @ApiProperty({
    example: 1,
    description: 'Page number for pagination',
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page: number;

  @ApiProperty({
    example: 30,
    description: 'Number of items per page',
    minimum: 1,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  per_page: number;

  @ApiProperty({
    example: 'John',
    description: 'Search term for filtering drivers',
    required: false,
  })
  @IsOptional()
  @IsString()
  search?: string;
}
