import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class DeactivateOtherMobileDevicesDto {
	@ApiProperty({
		description: 'user_devices.id of the current device to keep',
		example: 'clxyz123',
	})
	@IsString()
	@IsNotEmpty()
	keepDeviceRowId: string;
}
