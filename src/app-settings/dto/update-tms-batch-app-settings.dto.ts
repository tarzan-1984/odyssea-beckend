import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class UpdateTmsBatchAppSettingsDto {
	@ApiProperty({
		description:
			'Minimum seconds between TMS batch driver location sync jobs (backend cron). E.g. 300 = every 5 minutes.',
		example: 300,
		minimum: 60,
	})
	@IsInt()
	@Min(60)
	@Max(86_400)
	tmsBatchCronIntervalSeconds!: number;

	@ApiProperty({
		description: 'Maximum drivers per TMS batch POST request (1–500).',
		example: 150,
		minimum: 1,
	})
	@IsInt()
	@Min(1)
	@Max(500)
	tmsBatchChunkSize!: number;
}
