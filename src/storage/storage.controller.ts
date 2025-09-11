import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
	ApiTags,
	ApiOperation,
	ApiResponse,
	ApiBearerAuth,
} from '@nestjs/swagger';
import { S3Service } from '../s3/s3.service';
import { PresignDto } from './dto/presign.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Storage')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
	constructor(private readonly s3: S3Service) {}

	@Post('presign')
	@ApiOperation({
		summary: 'Generate presigned URL for file upload',
		description:
			'Creates a presigned URL for direct file upload to S3/Wasabi storage',
	})
	@ApiResponse({
		status: 200,
		description: 'Presigned URL generated successfully',
		schema: {
			type: 'object',
			properties: {
				uploadUrl: {
					type: 'string',
					description: 'URL for uploading the file',
				},
				fileUrl: {
					type: 'string',
					description: 'Final URL of the uploaded file',
				},
				key: { type: 'string', description: 'S3 object key' },
			},
		},
	})
	@ApiResponse({ status: 400, description: 'Invalid file type or filename' })
	@ApiResponse({ status: 401, description: 'Unauthorized' })
	async presign(@Body() dto: PresignDto) {
		// Returns { uploadUrl, fileUrl, key }
		return this.s3.createPresignedPut(dto.filename, dto.contentType);
	}
}
