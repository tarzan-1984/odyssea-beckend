import {
	Body,
	Controller,
	Get,
	Post,
	Query,
	Request,
	UseGuards,
	BadRequestException,
} from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiBody,
	ApiOperation,
	ApiQuery,
	ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../types/request.types';
import {
	MessageTemplatesService,
	MessageTemplateScope,
} from './message-templates.service';
import { UpsertMessageTemplateDto } from './dto/upsert-message-template.dto';

@ApiTags('Message templates')
@ApiBearerAuth()
@Controller('message-templates')
@UseGuards(JwtAuthGuard)
export class MessageTemplatesController {
	constructor(
		private readonly messageTemplatesService: MessageTemplatesService,
	) {}

	@Get()
	@ApiOperation({
		summary: 'List message templates with pagination',
		description:
			'personal: templates owned by the current user (matching users.externalId). company: all other templates.',
	})
	@ApiQuery({ name: 'scope', enum: ['personal', 'company'], required: true })
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiQuery({ name: 'search', required: false, type: String })
	async list(
		@Request() req: AuthenticatedRequest,
		@Query('scope') scopeRaw: string,
		@Query('page') pageRaw?: string,
		@Query('limit') limitRaw?: string,
		@Query('search') search?: string,
	) {
		const scope = scopeRaw?.toLowerCase()?.trim();
		if (scope !== 'personal' && scope !== 'company') {
			throw new BadRequestException(
				'Query "scope" must be "personal" or "company"',
			);
		}

		const page = pageRaw ? parseInt(pageRaw, 10) : 1;
		const limit = limitRaw ? parseInt(limitRaw, 10) : 10;

		return this.messageTemplatesService.listForUser(
			req.user.id,
			scope as MessageTemplateScope,
			page,
			limit,
			search,
		);
	}

	@Post()
	@ApiOperation({
		summary: 'Create or update a message template',
		description:
			'Omit id to create a template for the current user (their TMS externalId). Send id to update title/content when that template belongs to the user.',
	})
	@ApiBody({ type: UpsertMessageTemplateDto })
	async upsert(
		@Request() req: AuthenticatedRequest,
		@Body() body: UpsertMessageTemplateDto,
	) {
		return this.messageTemplatesService.upsertForUser(req.user.id, body);
	}
}
