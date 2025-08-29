import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'refresh_token_here',
  })
  @IsNotEmpty()
  @IsString()
  refreshToken: string;
}
