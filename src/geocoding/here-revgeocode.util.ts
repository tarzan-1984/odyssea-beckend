import {
	HereRevgeocodeApiResponse,
	HereRevgeocodeResult,
} from './here-revgeocode.types';

const NON_LATIN_GEO = /[\u0400-\u04FF\u0500-\u052F]/;

function sanitizeLatinField(value: string): string {
	const t = value.trim();
	if (!t) return '';
	return NON_LATIN_GEO.test(t) ? '' : t;
}

/** Keep Latin address text but drop Cyrillic fragments (mixed labels from lang=ru). */
function sanitizeLabelField(value: string): string {
	return value
		.replace(/[\u0400-\u04FF\u0500-\u052F]/g, '')
		.replace(/\s+,/g, ',')
		.replace(/,\s*,/g, ',')
		.replace(/\s{2,}/g, ' ')
		.replace(/,\s*$/g, '')
		.trim();
}

export function buildHereMapsPointUrl(
	latitude: number,
	longitude: number,
	zoom = 16,
): string {
	return `https://maps.here.com/p/?map=${latitude},${longitude},${zoom}`;
}

export function hereRevgeocodeCacheKey(lat: number, lon: number): string {
	return `here:${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function parseHereRevgeocodeResponse(
	data: unknown,
): HereRevgeocodeResult | null {
	if (!data || typeof data !== 'object') {
		return null;
	}

	const items = (data as HereRevgeocodeApiResponse).items;
	if (!Array.isArray(items) || items.length === 0) {
		return null;
	}

	const item = items[0];
	const addr = item?.address;
	const position = item?.position;
	if (!addr || !position) {
		return null;
	}

	const lat = Number(position.lat);
	const lng = Number(position.lng);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return null;
	}

	const label = sanitizeLabelField(String(addr.label ?? ''));
	const street = sanitizeLatinField(String(addr.street ?? ''));
	const houseNumber = sanitizeLatinField(String(addr.houseNumber ?? ''));
	const city = sanitizeLatinField(
		String(addr.city ?? addr.county ?? addr.district ?? ''),
	);
	const state = sanitizeLatinField(String(addr.state ?? ''));
	const stateCode = sanitizeLatinField(String(addr.stateCode ?? ''));
	const postalCode = sanitizeLatinField(String(addr.postalCode ?? ''));
	const countryCode = sanitizeLatinField(String(addr.countryCode ?? ''));
	const countryName = sanitizeLatinField(String(addr.countryName ?? ''));

	if (
		!label &&
		!street &&
		!city &&
		!postalCode &&
		!state &&
		!stateCode
	) {
		return null;
	}

	return {
		title: sanitizeLatinField(String(item.title ?? '')),
		resultType: String(item.resultType ?? ''),
		position: { lat, lng },
		address: {
			label,
			street,
			houseNumber,
			city,
			state,
			stateCode,
			postalCode,
			countryCode,
			countryName,
		},
	};
}
