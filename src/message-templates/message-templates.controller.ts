import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	ParseIntPipe,
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
	ApiParam,
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
import { UserRole } from '@prisma/client';

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
			'personal: your personal templates (type personal, group null). company: role-based catalogue; administrators may filter with companyGroup.',
	})
	@ApiQuery({ name: 'scope', enum: ['personal', 'company'], required: true })
	@ApiQuery({
		name: 'companyGroup',
		required: false,
		description:
			'Administrators only: filter company templates — all | Expedite | HR | Tracking. Default all.',
	})
	@ApiQuery({ name: 'page', required: false, type: Number })
	@ApiQuery({ name: 'limit', required: false, type: Number })
	@ApiQuery({ name: 'search', required: false, type: String })
	async list(
		@Request() req: AuthenticatedRequest,
		@Query('scope') scopeRaw: string,
		@Query('companyGroup') companyGroupRaw?: string,
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

		const role = (req.user.role ?? '').trim().toUpperCase();
		const companyGroup =
			role === UserRole.ADMINISTRATOR ? companyGroupRaw : undefined;

		return this.messageTemplatesService.listForUser(
			req.user.id,
			req.user.role,
			scope as MessageTemplateScope,
			page,
			limit,
			search,
			companyGroup,
		);
	}

	@Post()
	@ApiOperation({
		summary: 'Create or update a message template',
		description:
			'Personal templates: type personal (group must be omitted / null server-side). Company: creators per role mapping; ADMIN must send group.',
	})
	@ApiBody({ type: UpsertMessageTemplateDto })
	async upsert(
		@Request() req: AuthenticatedRequest,
		@Body() body: UpsertMessageTemplateDto,
	) {
		return this.messageTemplatesService.upsertForUser(
			req.user.id,
			req.user.role,
			body,
		);
	}

	@Delete(':id')
	@ApiOperation({
		summary: 'Delete message template',
		description:
			'Owners may delete personal templates. Company: admins delete any company template; creators delete only own company templates in their mapped group.',
	})
	@ApiParam({ name: 'id', type: Number })
	async remove(
		@Request() req: AuthenticatedRequest,
		@Param('id', ParseIntPipe) id: number,
	) {
		return this.messageTemplatesService.deleteForUser(
			req.user.id,
			req.user.role,
			id,
		);
	}
}
