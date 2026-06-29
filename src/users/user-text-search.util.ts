import { Prisma } from '@prisma/client';

export type UserTextSearchFieldOptions = {
	includePhone?: boolean;
	includeExternalId?: boolean;
	includeTrackingLoadId?: boolean;
};

function fieldMatchersForToken(
	token: string,
	options: UserTextSearchFieldOptions,
): Prisma.UserWhereInput[] {
	const matchers: Prisma.UserWhereInput[] = [
		{ firstName: { contains: token, mode: 'insensitive' } },
		{ lastName: { contains: token, mode: 'insensitive' } },
		{ email: { contains: token, mode: 'insensitive' } },
	];

	if (options.includePhone) {
		matchers.push({
			phone: { not: null, contains: token, mode: 'insensitive' },
		});
		const digitsOnly = token.replace(/\D/g, '');
		if (digitsOnly.length >= 3 && digitsOnly !== token) {
			matchers.push({
				phone: { not: null, contains: digitsOnly, mode: 'insensitive' },
			});
		}
	}

	if (options.includeExternalId) {
		matchers.push({
			externalId: { not: null, contains: token, mode: 'insensitive' },
		});
	}

	if (options.includeTrackingLoadId) {
		matchers.push({
			trackingLoadId: { not: null, contains: token, mode: 'insensitive' },
		});
	}

	return matchers;
}

/**
 * Builds Prisma filter for user text search.
 * Single token: match any field. Multiple tokens: each token must match some field
 * (e.g. "Sasha Dohonov" matches firstName + lastName).
 */
export function buildUserTextSearchWhereInput(
	search?: string,
	options: UserTextSearchFieldOptions = {},
): Prisma.UserWhereInput | null {
	const q = typeof search === 'string' ? search.trim() : '';
	if (!q) return null;

	const tokens = q.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;

	if (tokens.length === 1) {
		return { OR: fieldMatchersForToken(tokens[0], options) };
	}

	return {
		AND: tokens.map((token) => ({
			OR: fieldMatchersForToken(token, options),
		})),
	};
}
