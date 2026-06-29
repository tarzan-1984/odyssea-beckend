import { Prisma, PrismaClient } from '@prisma/client';

export type UserTextSearchFieldOptions = {
	includePhone?: boolean;
	includeExternalId?: boolean;
	includeTrackingLoadId?: boolean;
};

export function normalizePhoneDigits(value: string): string {
	return value.replace(/\D/g, '');
}

/** True when the query is mostly digits/punctuation (e.g. "(667) 239-5553"). */
export function isPhoneLikeQuery(query: string): boolean {
	const trimmed = query.replace(/\s/g, '');
	if (!trimmed) return false;
	const digits = normalizePhoneDigits(trimmed);
	return digits.length >= 3 && digits.length / trimmed.length >= 0.5;
}

type PrismaQueryClient = Pick<PrismaClient, '$queryRaw'>;

export async function findUserIdsByPhoneDigits(
	prisma: PrismaQueryClient,
	digits: string,
): Promise<string[]> {
	const normalized = normalizePhoneDigits(digits);
	if (normalized.length < 3) return [];

	const rows = await prisma.$queryRaw<{ id: string }[]>`
		SELECT id FROM users
		WHERE phone IS NOT NULL
		AND regexp_replace(phone, '[^0-9]', '', 'g') ILIKE ${`%${normalized}%`}
	`;

	return rows.map((row) => row.id);
}

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
		const digitsOnly = normalizePhoneDigits(token);
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

async function augmentTokenMatchersWithPhoneDigits(
	prisma: PrismaQueryClient,
	token: string,
	options: UserTextSearchFieldOptions,
): Promise<Prisma.UserWhereInput> {
	const matchers = fieldMatchersForToken(token, options);

	if (options.includePhone) {
		const digitsOnly = normalizePhoneDigits(token);
		if (digitsOnly.length >= 3) {
			const ids = await findUserIdsByPhoneDigits(prisma, digitsOnly);
			if (ids.length > 0) {
				matchers.push({ id: { in: ids } });
			}
		}
	}

	return { OR: matchers };
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

/**
 * Same as buildUserTextSearchWhereInput, but also matches phone numbers by digits only
 * (e.g. query "6672395553" matches stored "(667) 239-5553").
 */
export async function buildUserTextSearchWhereInputWithPhoneDigits(
	prisma: PrismaQueryClient,
	search?: string,
	options: UserTextSearchFieldOptions = {},
): Promise<Prisma.UserWhereInput | null> {
	const q = typeof search === 'string' ? search.trim() : '';
	if (!q) return null;

	const tokens = q.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;

	if (tokens.length === 1) {
		return augmentTokenMatchersWithPhoneDigits(prisma, tokens[0], options);
	}

	const andClauses = await Promise.all(
		tokens.map((token) =>
			augmentTokenMatchersWithPhoneDigits(prisma, token, options),
		),
	);

	return { AND: andClauses };
}
