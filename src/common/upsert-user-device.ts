import type { Prisma } from '@prisma/client';

export type UserDeviceSnapshotInput = {
	userExternalId: string;
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

function buildUserDeviceSnapshotFields(input: UserDeviceLegacySnapshotInput): {
	platform: string;
	appVersion: string | null;
	deviceName: string | null;
	model: string | null;
	osVersion: string | null;
	pushToken: string | null;
	lastActiveAt: Date | null;
} {
	return {
		platform: String(input.platform ?? 'unknown').trim() || 'unknown',
		appVersion: input.appVersion?.trim() || null,
		deviceName: input.deviceName?.trim() || null,
		model: input.model?.trim() || null,
		osVersion: input.osVersion?.trim() || null,
		pushToken: input.pushToken?.trim() || null,
		lastActiveAt: input.lastActiveAt ?? null,
	};
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
	/** When true (login), deactivated devices become active again. Foreground sync must not set this. */
	reactivate?: boolean;
};

export type UserDeviceAccessState = {
	activeDevice: boolean;
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
		select: { activeDevice: true, blocked: true },
	});
	if (!row) {
		return null;
	}
	return {
		activeDevice: row.activeDevice,
		blocked: row.blocked,
	};
}

export async function isUserDeviceActive(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	userExternalId: string,
	deviceId: string,
): Promise<boolean | null> {
	const state = await getUserDeviceAccessState(
		prisma,
		userExternalId,
		deviceId,
	);
	if (!state) {
		return null;
	}
	return state.activeDevice;
}

/** Session sync / foreground: logout when removed from list or blocked. */
export function shouldForceLogoutForDeviceAccess(
	state: UserDeviceAccessState | null,
): boolean {
	if (!state) {
		return false;
	}
	return state.blocked || !state.activeDevice;
}

/** Login: blocked devices cannot sign in even with reactivate. */
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
	const reactivate = options?.reactivate === true;
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
			data: reactivate
				? { ...snapshot, activeDevice: true }
				: snapshot,
		});
		return;
	}

	await prisma.userDevice.create({
		data: {
			userExternalId,
			deviceId: null,
			...snapshot,
			activeDevice: true,
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
	const reactivate = options?.reactivate === true;
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
			data: reactivate
				? { ...snapshot, activeDevice: true }
				: snapshot,
		});
		await deleteMatchingLegacyUserDeviceOrphans(prisma, userExternalId, {
			...input,
			platform,
		});
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
				...(reactivate ? { activeDevice: true } : {}),
			},
		});
		return;
	}

	await prisma.userDevice.create({
		data: {
			userExternalId,
			deviceId,
			...snapshot,
			activeDevice: true,
		},
	});
}
