import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateBulkDirectChatsDto {
	@ApiProperty({
		description:
			'Driver user IDs (DB users.id) to open a private DIRECT chat with the authenticated user',
		example: ['clx123', 'clx456'],
		type: [String],
	})
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(50)
	@IsString({ each: true })
	driverUserIds: string[];
}
