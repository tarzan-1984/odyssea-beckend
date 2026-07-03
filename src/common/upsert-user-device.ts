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

export async function upsertUserDeviceLegacySnapshot(
	prisma:
		| Prisma.TransactionClient
		| { userDevice: Prisma.TransactionClient['userDevice'] },
	input: UserDeviceLegacySnapshotInput,
): Promise<void> {
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
			data: { ...snapshot, activeDevice: true },
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
): Promise<void> {
	const userExternalId = input.userExternalId.trim();
	if (!userExternalId) {
		return;
	}

	const deviceId = input.deviceId?.trim();
	if (deviceId) {
		await upsertUserDeviceSnapshot(prisma, {
			userExternalId,
			deviceId,
			platform: input.platform,
			appVersion: input.appVersion,
			deviceName: input.deviceName,
			model: input.model,
			osVersion: input.osVersion,
			pushToken: input.pushToken,
			lastActiveAt: input.lastActiveAt,
		});
		return;
	}

	await upsertUserDeviceLegacySnapshot(prisma, input);
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
): Promise<void> {
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
			data: { ...snapshot, activeDevice: true },
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
				activeDevice: true,
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
