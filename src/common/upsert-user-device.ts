import type { Prisma } from '@prisma/client';

export type UserDeviceSnapshotInput = {
	userExternalId: string;
	email?: string | null;
	deviceId: string;
	platform?: string | null;
	appVersion?: string | null;
	deviceName?: string | null;
	model?: string | null;
	osVersion?: string | null;
	pushToken?: string | null;
	lastActiveAt?: Date | null;
};

export type UserDeviceLegacySnapshotInput = Omit<
	UserDeviceSnapshotInput,
	'deviceId'
>;

function resolveUserDeviceEmail(email?: string | null): string | null {
	const trimmed = email?.trim();
	return trimmed || null;
}

function buildUserDeviceSnapshotFields(input: UserDeviceLegacySnapshotInput): {
	platform: string;
	appVersion: string | null;
	deviceName: string | null;
	model: string | null;
	osVersion: string | null;
	pushToken: string | null;
	lastActiveAt: Date | null;
	email?: string | null;
} {
	const fields = {
		platform: String(input.platform ?? 'unknown').trim() || 'unknown',
		appVersion: input.appVersion?.trim() || null,
		deviceName: input.deviceName?.trim() || null,
		model: input.model?.trim() || null,
		osVersion: input.osVersion?.trim() || null,
		pushToken: input.pushToken?.trim() || null,
		lastActiveAt: input.lastActiveAt ?? null,
	};
	if (input.email !== undefined) {
		return {
			...fields,
			email: resolveUserDeviceEmail(input.email),
		};
	}
	return fields;
}

function trimOrNull(value: string | null | undefined): string | null {
	const t = value?.trim();
	return t || null;
}

/**
 * Legacy row (deviceId=null) that likely represents the same physical phone before app upgrade.
 * Prefer pushToken match, then platform + model.
 */
async function findLegacyUserDeviceRowForMerge(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	userExternalId: string,
	input: UserDeviceLegacySnapshotInput,
): Promise<{ id: string } | null> {
	const pushToken = trimOrNull(input.pushToken);
	if (pushToken) {
		const byToken = await prisma.userDevice.findFirst({
			where: {
				userExternalId,
				deviceId: null,
				pushToken,
			},
			orderBy: { updatedAt: 'desc' },
			select: { id: true },
		});
		if (byToken) {
			return byToken;
		}
	}

	const platform = trimOrNull(input.platform);
	const model = trimOrNull(input.model);
	if (platform && model) {
		const byPlatformModel = await prisma.userDevice.findFirst({
			where: {
				userExternalId,
				deviceId: null,
				platform: { equals: platform, mode: 'insensitive' },
				model: { equals: model, mode: 'insensitive' },
			},
			orderBy: { updatedAt: 'desc' },
			select: { id: true },
		});
		if (byPlatformModel) {
			return byPlatformModel;
		}
	}

	return null;
}

/** Remove orphaned legacy rows after the same phone was registered with a stable deviceId. */
async function deleteMatchingLegacyUserDeviceOrphans(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	userExternalId: string,
	input: UserDeviceLegacySnapshotInput,
): Promise<void> {
	const pushToken = trimOrNull(input.pushToken);
	const platform = trimOrNull(input.platform);
	const model = trimOrNull(input.model);

	const orFilters: Prisma.UserDeviceWhereInput[] = [];
	if (pushToken) {
		orFilters.push({ pushToken });
	}
	if (platform && model) {
		orFilters.push({
			platform: { equals: platform, mode: 'insensitive' },
			model: { equals: model, mode: 'insensitive' },
		});
	}
	if (orFilters.length === 0) {
		return;
	}

	await prisma.userDevice.deleteMany({
		where: {
			userExternalId,
			deviceId: null,
			OR: orFilters,
		},
	});
}

export type UserDeviceUpsertOptions = {
	/** When false (foreground sync), only update an existing row — never create. */
	createIfMissing?: boolean;
};

export type UserDeviceAccessState = {
	blocked: boolean;
};

export async function getUserDeviceAccessState(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	userExternalId: string,
	deviceId: string,
): Promise<UserDeviceAccessState | null> {
	const ext = userExternalId.trim();
	const did = deviceId.trim();
	if (!ext || !did) {
		return null;
	}
	const row = await prisma.userDevice.findUnique({
		where: {
			userExternalId_deviceId: { userExternalId: ext, deviceId: did },
		},
		select: { blocked: true },
	});
	if (!row) {
		return null;
	}
	return {
		blocked: row.blocked,
	};
}

/** Session sync / foreground: logout when device row was removed or blocked. */
export function shouldForceLogoutForDeviceAccess(
	state: UserDeviceAccessState | null,
): boolean {
	if (!state) {
		return true;
	}
	return state.blocked;
}

/** Login: blocked devices cannot sign in. */
export function isDeviceBlockedForLogin(
	state: UserDeviceAccessState | null,
): boolean {
	return state?.blocked === true;
}

export async function upsertUserDeviceLegacySnapshot(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	input: UserDeviceLegacySnapshotInput,
	options?: UserDeviceUpsertOptions,
): Promise<void> {
	const createIfMissing = options?.createIfMissing !== false;
	const userExternalId = input.userExternalId.trim();
	if (!userExternalId) {
		return;
	}

	const snapshot = buildUserDeviceSnapshotFields(input);

	const existing = await prisma.userDevice.findFirst({
		where: { userExternalId, deviceId: null },
		orderBy: { updatedAt: 'desc' },
		select: { id: true },
	});

	if (existing) {
		await prisma.userDevice.update({
			where: { id: existing.id },
			data: snapshot,
		});
		return;
	}

	if (!createIfMissing) {
		return;
	}

	await prisma.userDevice.create({
		data: {
			userExternalId,
			deviceId: null,
			...snapshot,
		},
	});
}

/**
 * Registers device activity: uses deviceId when present, otherwise legacy single-row upsert.
 */
export async function registerUserDeviceActivity(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	input: UserDeviceLegacySnapshotInput & { deviceId?: string | null },
	options?: UserDeviceUpsertOptions,
): Promise<void> {
	const userExternalId = input.userExternalId.trim();
	if (!userExternalId) {
		return;
	}

	const deviceId = input.deviceId?.trim();
	if (deviceId) {
		await upsertUserDeviceSnapshot(
			prisma,
			{
				userExternalId,
				email: input.email,
				deviceId,
				platform: input.platform,
				appVersion: input.appVersion,
				deviceName: input.deviceName,
				model: input.model,
				osVersion: input.osVersion,
				pushToken: input.pushToken,
				lastActiveAt: input.lastActiveAt,
			},
			options,
		);
		return;
	}

	await upsertUserDeviceLegacySnapshot(prisma, input, options);
}

export type LocationDeviceSnapshot = {
	deviceId?: string | null;
	deviceModel?: string | null;
	deviceName?: string | null;
	devicePlatform?: string | null;
};

export function normalizeLocationDeviceSnapshot(
	input: LocationDeviceSnapshot | null | undefined,
): LocationDeviceSnapshot | null {
	if (!input) {
		return null;
	}
	const deviceId = input.deviceId?.trim() || null;
	if (!deviceId) {
		return null;
	}
	return {
		deviceId,
		deviceModel: input.deviceModel?.trim() || null,
		deviceName: input.deviceName?.trim() || null,
		devicePlatform: input.devicePlatform?.trim() || null,
	};
}

export async function upsertUserDeviceSnapshot(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	input: UserDeviceSnapshotInput,
	options?: UserDeviceUpsertOptions,
): Promise<void> {
	const createIfMissing = options?.createIfMissing !== false;
	const userExternalId = input.userExternalId.trim();
	const deviceId = input.deviceId.trim();
	if (!userExternalId || !deviceId) {
		return;
	}

	const platform = String(input.platform ?? 'unknown').trim() || 'unknown';
	const snapshot = buildUserDeviceSnapshotFields({
		...input,
		platform,
	});

	const existingByDeviceId = await prisma.userDevice.findUnique({
		where: {
			userExternalId_deviceId: { userExternalId, deviceId },
		},
		select: { id: true },
	});

	if (existingByDeviceId) {
		await prisma.userDevice.update({
			where: { id: existingByDeviceId.id },
			data: snapshot,
		});
		await deleteMatchingLegacyUserDeviceOrphans(prisma, userExternalId, {
			...input,
			platform,
		});
		return;
	}

	if (!createIfMissing) {
		return;
	}

	const legacyRow = await findLegacyUserDeviceRowForMerge(
		prisma,
		userExternalId,
		{ ...input, platform },
	);
	if (legacyRow) {
		await prisma.userDevice.update({
			where: { id: legacyRow.id },
			data: {
				deviceId,
				...snapshot,
			},
		});
		return;
	}

	await prisma.userDevice.create({
		data: {
			userExternalId,
			deviceId,
			...snapshot,
		},
	});
}
