import { Prisma } from '@prisma/client';
import { buildUserTextSearchWhereInput } from '../users/user-text-search.util';

/**
 * Prisma filter for archived LOAD chat sidebar search (name, loadId, participant users).
 */
export function buildArchivedLoadChatSearchWhereInput(
	search?: string,
): Prisma.ChatRoomWhereInput | null {
	const q = typeof search === 'string' ? search.trim() : '';
	if (!q) return null;

	const orConditions: Prisma.ChatRoomWhereInput[] = [
		{ name: { contains: q, mode: 'insensitive' } },
		{ loadId: { contains: q, mode: 'insensitive' } },
	];

	const userSearch = buildUserTextSearchWhereInput(q, {
		includePhone: true,
		includeExternalId: true,
	});
	if (userSearch) {
		orConditions.push({
			participants: {
				some: {
					isHidden: false,
					user: userSearch,
				},
			},
		});
	}

	return { OR: orConditions };
}
