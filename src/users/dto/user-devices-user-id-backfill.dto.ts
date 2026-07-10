import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UserDevicesUserIdBackfillDto {
	@ApiPropertyOptional({
		description: 'Rows per internal batch (1–200). Default 50.',
		example: 50,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(200)
	batchSize?: number;
}
