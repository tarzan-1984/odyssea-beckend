import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	Logger,
	Post,
	Request,
	UseGuards,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedRequest } from '../types/request.types';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

/** Human-readable operation labels for Render logs. */
const OPERATION_LABELS: Record<string, string> = {
	chat_photo_camera: 'Take photo (camera)',
	chat_photo_gallery: 'Choose from gallery',
	chat_photo_prepare_fallback: 'Prepare photo (device JPEG fallback)',
	chat_photo_upload: 'Upload photo to chat',
	chat_file_upload: 'Upload file to chat',
};

function resolveOperationLabel(feature: string, stage?: string | null): string {
	const base = OPERATION_LABELS[feature] ?? feature;
	if (stage && stage.trim()) {
		return `${base} [${stage}]`;
	}
	return base;
}

@ApiTags('Client errors')
@ApiBearerAuth()
@Controller('client-errors')
@UseGuards(JwtAuthGuard)
export class ClientErrorsController {
	private readonly logger = new Logger(ClientErrorsController.name);

	constructor(private readonly prisma: PrismaService) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary:
			'Report a client-side error (mobile diagnostics; visible in Render logs)',
	})
	@ApiResponse({ status: 201, description: 'Error logged' })
	async report(
		@Request() req: AuthenticatedRequest,
		@Body() body: ReportClientErrorDto,
	): Promise<{ success: true }> {
		const user = await this.prisma.user.findUnique({
			where: { id: req.user.id },
			select: {
				externalId: true,
				firstName: true,
				lastName: true,
				email: true,
			},
		});

		const externalId = user?.externalId?.trim() || null;
		const userName = [user?.firstName, user?.lastName]
			.filter(Boolean)
			.join(' ')
			.trim() || null;
		const operation = resolveOperationLabel(body.feature, body.stage);

		const payload = {
			externalId,
			userName,
			userId: req.user.id,
			email: user?.email ?? req.user.email ?? null,
			operation,
			feature: body.feature,
			stage: body.stage ?? null,
			message: body.message,
			platform: body.platform ?? null,
			osVersion: body.osVersion ?? null,
			model: body.model ?? null,
			deviceName: body.deviceName ?? null,
			deviceId: body.deviceId ?? null,
			appVersion: body.appVersion ?? null,
			details: body.details ?? null,
			stack: body.stack ? body.stack.slice(0, 4000) : null,
		};

		// Searchable in Render: [ClientError] externalId=3206 operation=...
		this.logger.error(
			`[ClientError] externalId=${externalId ?? 'n/a'} operation="${operation}" user="${userName ?? 'n/a'}" ${JSON.stringify(payload)}`,
		);

		return { success: true };
	}
}
