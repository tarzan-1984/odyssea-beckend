import { ApiProperty } from '@nestjs/swagger';
import { LoadBoardShipmentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLoadBoardShipmentStatusDto {
	@ApiProperty({
		enum: LoadBoardShipmentStatus,
		example: LoadBoardShipmentStatus.unposted,
	})
	@IsEnum(LoadBoardShipmentStatus)
	status: LoadBoardShipmentStatus;
}
