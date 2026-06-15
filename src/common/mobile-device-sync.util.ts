import type { RegisterMobileDeviceDto } from '../auth/dto/register-mobile-device.dto';
import type { MobileDeviceSyncQueryDto } from '../app-settings/dto/mobile-device-sync-query.dto';

export type MobileDeviceSyncPayload = {
	deviceId: string;
	platform?: string | null;
	appVersion?: string | null;
	deviceName?: string | null;
	model?: string | null;
	osVersion?: string | null;
	pushToken?: string | null;
};

export function parseMobileDeviceSyncPayload(
	input:
		| RegisterMobileDeviceDto
		| MobileDeviceSyncQueryDto
		| MobileDeviceSyncPayload
		| null
		| undefined,
): MobileDeviceSyncPayload | null {
	if (!input) {
		return null;
	}
	const deviceId = String(input.deviceId ?? '').trim();
	if (!deviceId) {
		return null;
	}
	return {
		deviceId,
		platform: input.platform?.trim() || null,
		appVersion: input.appVersion?.trim() || null,
		deviceName: input.deviceName?.trim() || null,
		model: input.model?.trim() || null,
		osVersion: input.osVersion?.trim() || null,
		pushToken: input.pushToken?.trim() || null,
	};
}

/** True when the client sent deviceId or any legacy device metadata field. */
export function hasAnyMobileDeviceSyncInput(
	input:
		| RegisterMobileDeviceDto
		| MobileDeviceSyncQueryDto
		| MobileDeviceSyncPayload
		| null
		| undefined,
): boolean {
	if (!input) {
		return false;
	}
	if (parseMobileDeviceSyncPayload(input)) {
		return true;
	}
	return Boolean(
		input.platform?.trim() ||
			input.appVersion?.trim() ||
			input.deviceName?.trim() ||
			input.model?.trim() ||
			input.osVersion?.trim() ||
			input.pushToken?.trim(),
	);
}
