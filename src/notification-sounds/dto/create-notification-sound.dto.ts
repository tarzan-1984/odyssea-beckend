import { IsInt, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateNotificationSoundDto {
	@IsUrl()
	fileUrl!: string;

	@IsString()
	key!: string;

	@IsString()
	fileName!: string;

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(2_000_000)
	fileSize?: number;
}

