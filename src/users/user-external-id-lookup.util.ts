import { Prisma, UserRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

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
