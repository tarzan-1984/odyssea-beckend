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
import { AuthenticatedRequest } from '../types/request.types';
import { ReportClientErrorDto } from './dto/report-client-error.dto';

@ApiTags('Client errors')
@ApiBearerAuth()
@Controller('client-errors')
@UseGuards(JwtAuthGuard)
export class ClientErrorsController {
	private readonly logger = new Logger(ClientErrorsController.name);

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
		const payload = {
			userId: req.user.id,
			email: req.user.email ?? null,
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

		// Single searchable line for Render: filter by [ClientError]
		this.logger.error(`[ClientError] ${JSON.stringify(payload)}`);

		return { success: true };
	}
}
