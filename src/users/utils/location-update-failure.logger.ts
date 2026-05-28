import { Logger } from '@nestjs/common';
import { UpdateUserLocationDto } from '../dto/update-user-location.dto';

export const LOCATION_UPDATE_FAILED_PREFIX = '[LOCATION_UPDATE_FAILED]';

export type LocationUpdateFailureSource =
	| 'not_found'
	| 'test_mode'
	| 'geo_fence'
	| 'database'
	| 'tms_sync'
	| 'validation'
	| 'unknown';

export type LocationUpdateRequestTrace = {
	urlParamUserId?: string;
	tokenSub?: string | null;
	isBackgroundPing?: boolean;
	isManualAction?: boolean;
};

export type LocationUpdateFailureLogInput = {
	userId: string;
	externalId?: string | null;
	reason: string;
	source: LocationUpdateFailureSource;
	httpStatus?: number;
	trace?: LocationUpdateRequestTrace;
	payload?: UpdateUserLocationDto;
	details?: Record<string, unknown>;
	error?: unknown;
};

function serializeError(error: unknown): Record<string, unknown> | string | undefined {
	if (error == null) {
		return undefined;
	}
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}
	return String(error);
}

function summarizePayload(
	payload?: UpdateUserLocationDto,
): Record<string, unknown> | undefined {
	if (!payload) {
		return undefined;
	}
	return {
		latitude: payload.latitude,
		longitude: payload.longitude,
		zip: payload.zip,
		city: payload.city,
		state: payload.state,
		location: payload.location,
		driverStatus: payload.driverStatus,
		statusDate: payload.statusDate,
		isAutoupdate: payload.isAutoupdate,
		isBackgroundTaskLocationUpdate: payload.isBackgroundTaskLocationUpdate,
		isManualDriverLocationAction: payload.isManualDriverLocationAction,
	};
}

function requestTypeLabel(trace?: LocationUpdateRequestTrace): string {
	if (trace?.isBackgroundPing) {
		return 'background_automatic';
	}
	if (trace?.isManualAction) {
		return 'manual_share_or_status';
	}
	return 'automatic_or_legacy';
}

/**
 * Structured log for failed mobile PUT /users/:id/location requests.
 */
export function logLocationUpdateFailure(
	logger: Logger,
	input: LocationUpdateFailureLogInput,
	level: 'error' | 'warn' = 'error',
): void {
	const lines = [
		LOCATION_UPDATE_FAILED_PREFIX,
		'Mobile driver location update request (PUT /v1/users/:id/location) did not complete successfully.',
		`userId=${input.userId}`,
		`externalId=${input.externalId?.trim() ? input.externalId.trim() : '(unknown)'}`,
		`failureSource=${input.source}`,
		`reason=${input.reason}`,
		...(input.httpStatus != null ? [`httpStatus=${input.httpStatus}`] : []),
		`requestType=${requestTypeLabel(input.trace)}`,
		...(input.trace?.urlParamUserId
			? [`urlParamUserId=${input.trace.urlParamUserId}`]
			: []),
		...(input.trace?.tokenSub
			? [`jwtSubFromBearer=${input.trace.tokenSub}`]
			: []),
		...(input.details
			? [`details=${JSON.stringify(input.details)}`]
			: []),
		...(input.payload
			? [`payloadSummary=${JSON.stringify(summarizePayload(input.payload))}`]
			: []),
	];

	const errSerialized = serializeError(input.error);
	if (errSerialized !== undefined) {
		lines.push(`error=${JSON.stringify(errSerialized)}`);
	}

	const message = lines.join('\n');
	if (level === 'warn') {
		logger.warn(message);
	} else {
		logger.error(message);
	}
}

export function isUserLocationUpdatePath(url: string, method?: string): boolean {
	if (method && method.toUpperCase() !== 'PUT') {
		return false;
	}
	return /\/users\/[^/]+\/location(?:\?|$)/.test(url);
}

export function extractUserIdFromLocationPath(url: string): string | null {
	const match = url.match(/\/users\/([^/]+)\/location/);
	return match?.[1]?.trim() || null;
}

export function httpExceptionMessage(exception: unknown): string {
	if (!(exception instanceof Error)) {
		return String(exception);
	}
	const response = (exception as { getResponse?: () => unknown }).getResponse?.();
	if (typeof response === 'string') {
		return response;
	}
	if (response && typeof response === 'object') {
		const msg = (response as { message?: unknown }).message;
		if (Array.isArray(msg)) {
			return msg.map(String).join('; ');
		}
		if (typeof msg === 'string') {
			return msg;
		}
		return JSON.stringify(response);
	}
	return exception.message;
}
