import {
	Injectable,
	BadRequestException,
	NotFoundException,
	ForbiddenException,
} from '@nestjs/common';
import { Prisma, UserRole, MessageTemplateType, MessageTemplateGroup } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMessageTemplateDto } from './dto/upsert-message-template.dto';

export type MessageTemplateScope = 'personal' | 'company';

/** Admin-only subgroup filter when listing company templates (`all` = no subgroup filter). */
export type MessageCompanyGroupFilter =
	| 'all'
	| 'Expedite'
	| 'HR'
	| 'Tracking';

export interface MessageTemplatesPagination {
	page: number;
	limit: number;
	total: number;
	totalPages: number;
	hasMore: boolean;
}

export interface MessageTemplatesListResult {
	items: Array<{
		id: number;
		externalId: string;
		type: MessageTemplateType;
		group: MessageTemplateGroup | null;
		title: string | null;
		content: string | null;
		createdAt: Date;
		updatedAt: Date;
	}>;
	pagination: MessageTemplatesPagination;
}

export type MessageTemplateRow = MessageTemplatesListResult['items'][number];

const templateSelect = {
	id: true,
	externalId: true,
	type: true,
	group: true,
	title: true,
	content: true,
	createdAt: true,
	updatedAt: true,
} as const;

function normRole(role?: string | null): string {
	return (role ?? '').trim().toUpperCase();
}

function canSeeCompanyTab(roleNorm: string): boolean {
	return (
		roleNorm === UserRole.ADMINISTRATOR ||
		roleNorm === UserRole.EXPEDITE_MANAGER ||
		roleNorm === UserRole.TRACKING_TL ||
		roleNorm === UserRole.RECRUITER_TL ||
		roleNorm === UserRole.RECRUITER ||
		roleNorm === UserRole.DISPATCHER ||
		roleNorm === UserRole.DISPATCHER_TL ||
		roleNorm === UserRole.NIGHTSHIFT_TRACKING ||
		roleNorm === UserRole.MORNING_TRACKING ||
		roleNorm === UserRole.TRACKING
	);
}

function isCompanyCreatorRole(roleNorm: string): boolean {
	return (
		roleNorm === UserRole.ADMINISTRATOR ||
		roleNorm === UserRole.EXPEDITE_MANAGER ||
		roleNorm === UserRole.TRACKING_TL ||
		roleNorm === UserRole.RECRUITER_TL
	);
}

function managerCompanyGroup(roleNorm: string): MessageTemplateGroup | null {
	if (roleNorm === UserRole.EXPEDITE_MANAGER) return MessageTemplateGroup.Expedite;
	if (roleNorm === UserRole.TRACKING_TL) return MessageTemplateGroup.Tracking;
	if (roleNorm === UserRole.RECRUITER_TL) return MessageTemplateGroup.HR;
	return null;
}

function dtoStringToGroup(
	v: NonNullable<UpsertMessageTemplateDto['group']>,
): MessageTemplateGroup {
	if (v === 'HR') return MessageTemplateGroup.HR;
	if (v === 'Tracking') return MessageTemplateGroup.Tracking;
	return MessageTemplateGroup.Expedite;
}

export function parseCompanyGroupQuery(raw?: string | null): MessageCompanyGroupFilter {
	const v = (raw ?? '').trim().toLowerCase();
	if (!v || v === 'all') return 'all';
	if (v === 'expedite') return 'Expedite';
	if (v === 'hr') return 'HR';
	if (v === 'tracking') return 'Tracking';
	throw new BadRequestException(
		'Query "companyGroup" must be all, Expedite, HR, or Tracking',
	);
}

/**
 * Builds the Prisma WHERE for company-scope listing.
 * Caller must ensure scope=company only for roles that passed canSeeCompanyTab.
 */
function buildCompanyListWhere(
	roleNorm: string,
	myExt: string | null,
	companyGroup?: MessageCompanyGroupFilter,
): Prisma.MessageTemplateWhereInput {
	const base: Prisma.MessageTemplateWhereInput = {
		type: MessageTemplateType.company,
		group: { not: null },
	};

	if (roleNorm === UserRole.ADMINISTRATOR) {
		const g =
			companyGroup && companyGroup !== 'all' ? companyGroup : undefined;
		if (g === 'Expedite' || g === 'HR' || g === 'Tracking') {
			return { ...base, group: dtoStringToGroup(g) };
		}
		return base;
	}

	if (roleNorm === UserRole.RECRUITER_TL) {
		if (!myExt) return { id: { in: [] } };
		return {
			AND: [base, { externalId: myExt }, { group: MessageTemplateGroup.HR }],
		};
	}

	if (roleNorm === UserRole.RECRUITER) {
		return { ...base, group: MessageTemplateGroup.HR };
	}

	if (roleNorm === UserRole.EXPEDITE_MANAGER) {
		if (!myExt) return { id: { in: [] } };
		return {
			AND: [
				base,
				{ externalId: myExt },
				{ group: MessageTemplateGroup.Expedite },
			],
		};
	}

	if (roleNorm === UserRole.TRACKING_TL) {
		if (!myExt) return { id: { in: [] } };
		return {
			AND: [
				base,
				{ externalId: myExt },
				{ group: MessageTemplateGroup.Tracking },
			],
		};
	}

	if (
		roleNorm === UserRole.DISPATCHER ||
		roleNorm === UserRole.DISPATCHER_TL
	) {
		return { ...base, group: MessageTemplateGroup.Expedite };
	}

	if (
		roleNorm === UserRole.NIGHTSHIFT_TRACKING ||
		roleNorm === UserRole.MORNING_TRACKING ||
		roleNorm === UserRole.TRACKING
	) {
		return { ...base, group: MessageTemplateGroup.Tracking };
	}

	return { id: { in: [] } };
}

@Injectable()
export class MessageTemplatesService {
	constructor(private readonly prisma: PrismaService) {}

	async upsertForUser(
		userId: string,
		userRoleRaw: string,
		dto: UpsertMessageTemplateDto,
	): Promise<MessageTemplateRow> {
		const roleNorm = normRole(userRoleRaw);

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const externalId = user?.externalId ?? null;

		const rawTitle = dto.title ?? '';
		const rawContent = dto.content ?? '';
		const titleTrimmed = rawTitle.trim();
		const contentTrimmed = rawContent.trim();
		if (!contentTrimmed) {
			throw new BadRequestException('Message content is required');
		}
		const titleValue = titleTrimmed.length > 0 ? titleTrimmed : null;

		if (!externalId) {
			throw new BadRequestException(
				'Cannot save templates without a linked TMS external ID',
			);
		}

		if (dto.id != null) {
			const existing = await this.prisma.messageTemplate.findUnique({
				where: { id: dto.id },
				select: {
					id: true,
					externalId: true,
					type: true,
					group: true,
				},
			});
			if (!existing) {
				throw new NotFoundException('Template not found');
			}

			const isAdmin = roleNorm === UserRole.ADMINISTRATOR;

			if (existing.type === MessageTemplateType.personal) {
				const isOwner = existing.externalId === externalId;
				if (!isAdmin && !isOwner) {
					throw new ForbiddenException('Cannot update this template');
				}

				if (dto.type === MessageTemplateType.company) {
					throw new BadRequestException(
						'Cannot change a personal template into a company template',
					);
				}

				return this.prisma.messageTemplate.update({
					where: { id: dto.id },
					data: {
						title: titleValue,
						content: contentTrimmed,
						type: MessageTemplateType.personal,
						group: null,
					},
					select: templateSelect,
				});
			}

			// company row
			if (!isCompanyCreatorRole(roleNorm) && !isAdmin) {
				throw new ForbiddenException('Cannot update company templates');
			}

			if (!isAdmin) {
				if (existing.externalId !== externalId) {
					throw new ForbiddenException('Cannot update this template');
				}
				const expected = managerCompanyGroup(roleNorm);
				if (!expected || existing.group !== expected) {
					throw new ForbiddenException('Cannot update this template');
				}
			}

			if (dto.type === MessageTemplateType.personal) {
				throw new BadRequestException(
					'Cannot change a company template into a personal template',
				);
			}

			const updateData: Prisma.MessageTemplateUpdateInput = {
				title: titleValue,
				content: contentTrimmed,
			};
			if (isAdmin && dto.group != null) {
				updateData.group = dtoStringToGroup(dto.group);
			}

			return this.prisma.messageTemplate.update({
				where: { id: dto.id },
				data: updateData,
				select: templateSelect,
			});
		}

		// Create
		const intentCompany = dto.type === MessageTemplateType.company;

		if (!intentCompany) {
			if (dto.type != null && dto.type !== MessageTemplateType.personal) {
				throw new BadRequestException('Invalid template type');
			}

			return this.prisma.messageTemplate.create({
				data: {
					externalId,
					type: MessageTemplateType.personal,
					group: null,
					title: titleValue,
					content: contentTrimmed,
				},
				select: templateSelect,
			});
		}

		// company create
		if (!isCompanyCreatorRole(roleNorm)) {
			throw new ForbiddenException('Cannot create company templates');
		}

		let group: MessageTemplateGroup;
		if (roleNorm === UserRole.ADMINISTRATOR) {
			if (dto.group == null) {
				throw new BadRequestException(
					'Administrators must specify group (Expedite, HR, or Tracking) when creating a company template',
				);
			}
			group = dtoStringToGroup(dto.group);
		} else {
			const mapped = managerCompanyGroup(roleNorm);
			if (!mapped) {
				throw new ForbiddenException('Cannot create company templates');
			}
			group = mapped;
		}

		return this.prisma.messageTemplate.create({
			data: {
				externalId,
				type: MessageTemplateType.company,
				group,
				title: titleValue,
				content: contentTrimmed,
			},
			select: templateSelect,
		});
	}

	async deleteForUser(
		userId: string,
		userRole: string,
		templateId: number,
	): Promise<{ id: number }> {
		const roleNorm = normRole(userRole);

		const template = await this.prisma.messageTemplate.findUnique({
			where: { id: templateId },
			select: {
				id: true,
				externalId: true,
				type: true,
				group: true,
			},
		});
		if (!template) {
			throw new NotFoundException('Template not found');
		}

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const myExt = user?.externalId ?? null;

		const isAdmin = roleNorm === UserRole.ADMINISTRATOR;

		if (template.type === MessageTemplateType.personal) {
			if (isAdmin) {
				await this.prisma.messageTemplate.delete({ where: { id: templateId } });
				return { id: templateId };
			}
			if (!myExt || template.externalId !== myExt) {
				throw new ForbiddenException('Cannot delete this template');
			}
			await this.prisma.messageTemplate.delete({ where: { id: templateId } });
			return { id: templateId };
		}

		// company
		if (isAdmin) {
			await this.prisma.messageTemplate.delete({ where: { id: templateId } });
			return { id: templateId };
		}

		const isCreatorManager =
			isCompanyCreatorRole(roleNorm) &&
			roleNorm !== UserRole.ADMINISTRATOR &&
			!!myExt &&
			template.externalId === myExt;

		const expected = managerCompanyGroup(roleNorm);

		if (
			isCreatorManager &&
			expected != null &&
			template.group === expected
		) {
			await this.prisma.messageTemplate.delete({ where: { id: templateId } });
			return { id: templateId };
		}

		throw new ForbiddenException('Cannot delete this template');
	}

	async listForUser(
		userId: string,
		userRoleRaw: string,
		scope: MessageTemplateScope,
		page: number,
		limit: number,
		search?: string,
		companyGroupRaw?: string | null,
	): Promise<MessageTemplatesListResult> {
		const roleNorm = normRole(userRoleRaw);
		const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
		const safeLimitRaw = Number.isFinite(limit) ? Math.floor(limit) : 10;
		const safeLimit = Math.min(Math.max(safeLimitRaw, 1), 50);

		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const myExt = user?.externalId ?? null;

		const q = search?.trim() ?? '';
		const searchFilter: Prisma.MessageTemplateWhereInput | undefined =
			q.length > 0
				? {
						OR: [
							{ title: { contains: q, mode: 'insensitive' } },
							{ content: { contains: q, mode: 'insensitive' } },
						],
					}
				: undefined;

		let where: Prisma.MessageTemplateWhereInput;

		if (scope === 'personal') {
			if (!myExt) {
				return emptyPage(safePage, safeLimit);
			}
			where = searchFilter
				? {
						AND: [
							{ externalId: myExt },
							{ type: MessageTemplateType.personal },
							{ group: null },
							searchFilter,
						],
					}
				: {
						externalId: myExt,
						type: MessageTemplateType.personal,
						group: null,
					};
		} else {
			if (!canSeeCompanyTab(roleNorm)) {
				throw new ForbiddenException(
					'You cannot access company message templates',
				);
			}
			let subgroup: MessageCompanyGroupFilter | undefined;
			if (roleNorm === UserRole.ADMINISTRATOR) {
				subgroup = parseCompanyGroupQuery(companyGroupRaw);
			}

			const companyWhere = buildCompanyListWhere(roleNorm, myExt, subgroup);
			where = searchFilter
				? { AND: [companyWhere, searchFilter] }
				: companyWhere;
		}

		const skip = (safePage - 1) * safeLimit;

		const [total, rows] = await Promise.all([
			this.prisma.messageTemplate.count({ where }),
			this.prisma.messageTemplate.findMany({
				where,
				skip,
				take: safeLimit,
				orderBy: { updatedAt: 'desc' },
				select: templateSelect,
			}),
		]);

		const totalPages = total === 0 ? 0 : Math.ceil(total / safeLimit);
		const hasMore = totalPages > 0 && safePage < totalPages;

		return {
			items: rows,
			pagination: {
				page: safePage,
				limit: safeLimit,
				total,
				totalPages,
				hasMore,
			},
		};
	}
}

function emptyPage(page: number, limit: number): MessageTemplatesListResult {
	return {
		items: [],
		pagination: {
			page,
			limit,
			total: 0,
			totalPages: 0,
			hasMore: false,
		},
	};
}
