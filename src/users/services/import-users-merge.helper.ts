import { Prisma } from '@prisma/client';

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
