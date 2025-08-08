import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum } from 'class-validator';

export enum SocialProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  APPLE = 'apple',
}

export class SocialLoginDto {
  @ApiProperty({
    example: 'google',
    description: 'Social provider (google, facebook, apple)',
    enum: SocialProvider,
  })
  @IsEnum(SocialProvider)
  provider: SocialProvider;

  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Access token from social provider',
  })
  @IsString()
  accessToken: string;
}
