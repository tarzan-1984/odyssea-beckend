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

/**
 * Legacy mobile clients (no stable deviceId): keep/update one row with deviceId=null.
 */
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
			data: snapshot,
		});
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

	await prisma.userDevice.upsert({
		where: {
			userExternalId_deviceId: { userExternalId, deviceId },
		},
		create: {
			userExternalId,
			deviceId,
			...snapshot,
		},
		update: snapshot,
	});
}
