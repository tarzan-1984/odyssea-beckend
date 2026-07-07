import { Prisma, UserRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

export type ChatParticipantRef = {
	id: string;
	role?: string;
};

export function trimExternalId(externalId: string | null | undefined): string {
	return String(externalId ?? '').trim();
}

export function isDriverParticipantRole(
	role: string | null | undefined,
): boolean {
	return trimExternalId(role).toUpperCase() === 'DRIVER';
}

export function userWhereDriverByExternalId(
	externalId: string,
): Prisma.UserWhereInput {
	return {
		externalId: trimExternalId(externalId),
		role: UserRole.DRIVER,
	};
}

export function userWhereEmployeeByExternalId(
	externalId: string,
): Prisma.UserWhereInput {
	return {
		externalId: trimExternalId(externalId),
		role: { not: UserRole.DRIVER },
	};
}

export function userWhereByExternalIdAndParticipantRole(
	externalId: string,
	participantRole: string | null | undefined,
): Prisma.UserWhereInput {
	if (isDriverParticipantRole(participantRole)) {
		return userWhereDriverByExternalId(externalId);
	}
	return userWhereEmployeeByExternalId(externalId);
}

export function isDriverUserRole(role: string | null | undefined): boolean {
	return trimExternalId(role).toUpperCase() === 'DRIVER';
}

/** TMS participant role (driver vs employee) must match the users.role category. */
export function participantRoleMatchesUser(
	participantRole: string | null | undefined,
	userRole: string | null | undefined,
): boolean {
	return (
		isDriverParticipantRole(participantRole) === isDriverUserRole(userRole)
	);
}

/** Payload key: externalId + raw participant role (case-insensitive). */
export function participantExternalRoleKey(
	externalId: string,
	participantRole: string | null | undefined,
): string {
	return `${trimExternalId(externalId)}|${trimExternalId(participantRole).toUpperCase()}`;
}

/** Lookup/dedup key: externalId + DRIVER vs EMPLOYEE category. */
export function participantRoleCategoryKey(
	externalId: string,
	participantRole: string | null | undefined,
): string {
	const category = isDriverParticipantRole(participantRole) ? 'DRIVER' : 'EMPLOYEE';
	return `${trimExternalId(externalId)}|${category}`;
}

export function userRoleCategoryKey(
	externalId: string,
	userRole: string | null | undefined,
): string {
	const participantRole = isDriverUserRole(userRole) ? 'DRIVER' : 'EMPLOYEE';
	return participantRoleCategoryKey(externalId, participantRole);
}

export class ExternalIdRoleRequiredError extends Error {
	constructor(readonly externalId: string) {
		super(`Participant role is required to resolve externalId "${externalId}"`);
		this.name = 'ExternalIdRoleRequiredError';
	}
}

export class AmbiguousExternalIdError extends Error {
	constructor(
		readonly externalId: string,
		readonly participantRole: string,
		readonly matchCount: number,
	) {
		super(
			`Multiple users (${matchCount}) share externalId "${externalId}" for role category "${participantRole}"`,
		);
		this.name = 'AmbiguousExternalIdError';
	}
}

/**
 * Resolve TMS externalId + participant role to exactly one user.
 * Throws when role is missing or multiple users match the same category.
 */
export async function findSingleUserByExternalIdAndParticipantRole<
	T extends Prisma.UserSelect,
>(
	prisma: Pick<PrismaService, 'user'>,
	externalId: string,
	participantRole: string | null | undefined,
	select: T,
): Promise<Prisma.UserGetPayload<{ select: T }> | null> {
	const id = trimExternalId(externalId);
	const role = trimExternalId(participantRole);
	if (!id) {
		return null;
	}
	if (!role) {
		throw new ExternalIdRoleRequiredError(id);
	}

	const matches = await prisma.user.findMany({
		where: userWhereByExternalIdAndParticipantRole(id, participantRole),
		select,
		take: 2,
	});

	if (matches.length === 0) {
		return null;
	}
	if (matches.length > 1) {
		throw new AmbiguousExternalIdError(id, role, matches.length);
	}
	return matches[0];
}

export async function resolveParticipantUser<
	T extends Prisma.UserSelect,
>(
	prisma: Pick<PrismaService, 'user'>,
	participant: { id: string; role?: string | null },
	select: T,
): Promise<Prisma.UserGetPayload<{ select: T }> | null> {
	const id = trimExternalId(participant.id);
	if (!id) {
		return null;
	}

	const selectWithRole = { ...select, role: true } as T & { role: true };

	const byInternalId = await prisma.user.findUnique({
		where: { id },
		select: selectWithRole,
	});
	if (byInternalId) {
		if (
			participant.role &&
			!participantRoleMatchesUser(
				participant.role,
				(byInternalId as { role: string }).role,
			)
		) {
			return null;
		}
		return byInternalId as unknown as Prisma.UserGetPayload<{ select: T }>;
	}

	return findSingleUserByExternalIdAndParticipantRole(
		prisma,
		id,
		participant.role,
		select,
	);
}

export function userWhereDriversByExternalIds(
	externalIds: Array<string | null | undefined>,
): Prisma.UserWhereInput {
	const ids = [
		...new Set(externalIds.map(trimExternalId).filter((id) => id.length > 0)),
	];
	return {
		externalId: { in: ids },
		role: UserRole.DRIVER,
	};
}

export function mergeUserWhereWithExternalIdRoleFilter(
	base: Prisma.UserWhereInput,
	options?: { role?: UserRole; excludeDriver?: boolean },
): Prisma.UserWhereInput {
	if (options?.role) {
		return { ...base, role: options.role };
	}
	if (options?.excludeDriver) {
		return { ...base, role: { not: UserRole.DRIVER } };
	}
	return base;
}

/** Prefer DRIVER when TMS externalId is duplicated on employee + driver rows. */
export async function findUserByExternalIdPreferDriver<
	T extends Prisma.UserSelect,
>(
	prisma: Pick<PrismaService, 'user'>,
	externalId: string,
	select: T,
): Promise<Prisma.UserGetPayload<{ select: T }> | null> {
	const id = trimExternalId(externalId);
	if (!id) {
		return null;
	}

	const asDriver = await prisma.user.findFirst({
		where: userWhereDriverByExternalId(id),
		select,
	});
	if (asDriver) {
		return asDriver;
	}

	return prisma.user.findFirst({
		where: userWhereEmployeeByExternalId(id),
		select,
	});
}
