import {
	Injectable,
	BadRequestException,
	NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertMessageTemplateDto } from './dto/upsert-message-template.dto';

export type MessageTemplateScope = 'personal' | 'company';

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
	title: true,
	content: true,
	createdAt: true,
	updatedAt: true,
} as const;

@Injectable()
export class MessageTemplatesService {
	constructor(private readonly prisma: PrismaService) {}

	async upsertForUser(
		userId: string,
		dto: UpsertMessageTemplateDto,
	): Promise<MessageTemplateRow> {
		const user = await this.prisma.user.findUnique({
			where: { id: userId },
			select: { externalId: true },
		});
		const externalId = user?.externalId ?? null;
		if (!externalId) {
			throw new BadRequestException(
				'Cannot save templates without a linked TMS external ID',
			);
		}

		const rawTitle = dto.title ?? '';
		const rawContent = dto.content ?? '';
		const titleTrimmed = rawTitle.trim();
		const contentTrimmed = rawContent.trim();
		if (!contentTrimmed) {
			throw new BadRequestException('Message content is required');
		}

		const titleValue = titleTrimmed.length > 0 ? titleTrimmed : null;

		if (dto.id != null) {
			const owned = await this.prisma.messageTemplate.findFirst({
				where: { id: dto.id, externalId },
				select: { id: true },
			});
			if (!owned) {
				throw new NotFoundException('Template not found');
			}

			return this.prisma.messageTemplate.update({
				where: { id: dto.id },
				data: {
					title: titleValue,
					content: contentTrimmed,
				},
				select: templateSelect,
			});
		}

		return this.prisma.messageTemplate.create({
			data: {
				externalId,
				title: titleValue,
				content: contentTrimmed,
			},
			select: templateSelect,
		});
	}

	async listForUser(
		userId: string,
		scope: MessageTemplateScope,
		page: number,
		limit: number,
		search?: string,
	): Promise<MessageTemplatesListResult> {
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
				return {
					items: [],
					pagination: {
						page: safePage,
						limit: safeLimit,
						total: 0,
						totalPages: 0,
						hasMore: false,
					},
				};
			}
			where = searchFilter
				? { AND: [{ externalId: myExt }, searchFilter] }
				: { externalId: myExt };
		} else if (myExt) {
			where = searchFilter
				? { AND: [{ externalId: { not: myExt } }, searchFilter] }
				: { externalId: { not: myExt } };
		} else {
			where = searchFilter ?? {};
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
