import { Prisma, UserRole } from '@prisma/client';

/**
 * True if null, undefined, or whitespace-only.
 */
export function isBlankString(
	value: string | null | undefined,
): boolean {
	return value == null || String(value).trim() === '';
}

export type UserRowForImportMerge = {
	firstName: string;
	lastName: string;
	phone: string | null;
	location: string | null;
	company: string[];
	userColor: string | null;
};

export type IncomingImportFields = {
	firstName: string;
	lastName: string;
	phone: string;
	location: string;
	company: string[];
	userColor: string | null;
};

/**
 * Fields that must never be changed when re-importing an existing user (matched by email).
 */
export const IMPORT_USER_PROTECTED_ON_UPDATE = [
	'password',
	'profilePhoto',
	'status',
] as const;

export type ExistingUserForImport = UserRowForImportMerge & {
	role: UserRole;
	externalId: string | null;
};

export type IncomingUserImportSync = IncomingImportFields & {
	role: UserRole;
	externalId: string;
};

/**
 * Update payload for an existing imported user.
 * Never includes password, profilePhoto, or status.
 */
export function buildExistingUserImportUpdate(
	existing: ExistingUserForImport,
	incoming: IncomingUserImportSync,
): Prisma.UserUpdateInput {
	return {
		...buildImportMergeUpdate(existing, incoming),
		role: incoming.role,
		externalId: incoming.externalId,
	};
}

export function isExistingUserImportUnchanged(
	existing: ExistingUserForImport,
	incoming: IncomingUserImportSync,
): boolean {
	const mergeData = buildImportMergeUpdate(existing, incoming);
	return (
		Object.keys(mergeData).length === 0 &&
		existing.role === incoming.role &&
		existing.externalId === incoming.externalId
	);
}

/**
 * For existing users: only set fields that are still empty in DB.
 * Role / status / password / profilePhoto are not part of import merge (unchanged here).
 */
export function buildImportMergeUpdate(
	existing: UserRowForImportMerge,
	incoming: IncomingImportFields,
): Prisma.UserUpdateInput {
	const data: Prisma.UserUpdateInput = {};

	if (
		isBlankString(existing.firstName) &&
		!isBlankString(incoming.firstName)
	) {
		data.firstName = incoming.firstName.trim();
	}
	if (
		isBlankString(existing.lastName) &&
		!isBlankString(incoming.lastName)
	) {
		data.lastName = incoming.lastName.trim();
	}

	if (isBlankString(existing.phone) && !isBlankString(incoming.phone)) {
		data.phone = incoming.phone.trim();
	}
	if (
		isBlankString(existing.location) &&
		!isBlankString(incoming.location)
	) {
		data.location = incoming.location.trim();
	}

	const hasCompany =
		Array.isArray(existing.company) && existing.company.length > 0;
	if (!hasCompany && incoming.company.length > 0) {
		data.company = incoming.company;
	}

	if (isBlankString(existing.userColor) && !isBlankString(incoming.userColor)) {
		data.userColor = (incoming.userColor as string).trim();
	}

	return data;
}
