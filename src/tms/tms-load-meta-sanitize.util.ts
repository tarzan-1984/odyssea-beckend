/**
 * Temporary: strip sensitive TMS load meta fields in mobile API responses
 * until clients ship UI updates that hide them.
 */
export const MOBILE_LOAD_META_BOOKED_RATE_KEY = 'booked_rate' as const;

/** Single WP media id fields shown on the mobile Documents tab. */
export const MOBILE_HIDDEN_LOAD_DOCUMENT_SINGLE_KEYS = [
	'proof_of_delivery',
	'updated_rate_confirmation',
	'screen_picture',
] as const;

/** Multi-file WP media id fields shown on the mobile Documents tab. */
export const MOBILE_HIDDEN_LOAD_DOCUMENT_ARRAY_KEYS = [
	'freight_pictures',
	'attached_files',
] as const;

export const MOBILE_DRIVER_HIDDEN_LOAD_META_KEYS = [
	'load_type',
	'source',
	'profit',
] as const;

export type SanitizeMobileLoadMetaOptions = {
	forDriver: boolean;
};

export function sanitizeMobileLoadMeta(
	meta: Record<string, unknown> | null | undefined,
	options: SanitizeMobileLoadMetaOptions,
): Record<string, unknown> {
	if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
		return {};
	}

	const next = { ...meta };
	next[MOBILE_LOAD_META_BOOKED_RATE_KEY] = '';

	for (const key of MOBILE_HIDDEN_LOAD_DOCUMENT_SINGLE_KEYS) {
		next[key] = '';
	}
	for (const key of MOBILE_HIDDEN_LOAD_DOCUMENT_ARRAY_KEYS) {
		next[key] = [];
	}

	if (options.forDriver) {
		for (const key of MOBILE_DRIVER_HIDDEN_LOAD_META_KEYS) {
			next[key] = '';
		}
	}

	return next;
}

function sanitizeLoadRow(
	load: Record<string, unknown>,
	options: SanitizeMobileLoadMetaOptions,
): Record<string, unknown> {
	const meta = load.meta_data;
	if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
		return load;
	}

	return {
		...load,
		meta_data: sanitizeMobileLoadMeta(meta as Record<string, unknown>, options),
	};
}

function sanitizeLoadsArray(
	loads: unknown,
	options: SanitizeMobileLoadMetaOptions,
): unknown {
	if (!Array.isArray(loads)) {
		return loads;
	}

	return loads.map((row) =>
		row != null && typeof row === 'object' && !Array.isArray(row)
			? sanitizeLoadRow(row as Record<string, unknown>, options)
			: row,
	);
}

/** Sanitizes TMS GET /driver/loads proxy payload (supports nested `data.loads`). */
export function sanitizeMobileDriverLoadsResponse(
	response: unknown,
	options: SanitizeMobileLoadMetaOptions,
): unknown {
	if (response == null || typeof response !== 'object' || Array.isArray(response)) {
		return response;
	}

	const root = response as Record<string, unknown>;
	const next: Record<string, unknown> = { ...root };

	if (Array.isArray(root.loads)) {
		next.loads = sanitizeLoadsArray(root.loads, options);
	}

	const data = root.data;
	if (data != null && typeof data === 'object' && !Array.isArray(data)) {
		const dataRec = data as Record<string, unknown>;
		next.data = {
			...dataRec,
			loads: sanitizeLoadsArray(dataRec.loads, options),
		};
	}

	return next;
}

export type TmsLoadDetailsLike = {
	data?: {
		meta_data?: Record<string, unknown> | null;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

export function sanitizeMobileLoadDetailsResponse<T extends TmsLoadDetailsLike | null>(
	response: T,
	options: SanitizeMobileLoadMetaOptions,
): T {
	if (!response?.data?.meta_data) {
		return response;
	}

	return {
		...response,
		data: {
			...response.data,
			meta_data: sanitizeMobileLoadMeta(response.data.meta_data, options),
		},
	} as T;
}
