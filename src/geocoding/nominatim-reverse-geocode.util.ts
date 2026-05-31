/** Parsed address fields from Nominatim reverse JSON (`addressdetails=1`). */
export type NominatimReverseAddress = {
	city: string;
	state: string;
	zip: string;
	country: string;
};

const NON_LATIN_GEO = /[\u0400-\u04FF\u0500-\u052F]/;

function sanitizeLatinField(value: string): string {
	const t = value.trim();
	if (!t) return '';
	return NON_LATIN_GEO.test(t) ? '' : t;
}

const LOCALITY_KEYS = [
	'city',
	'town',
	'village',
	'municipality',
	'hamlet',
	'suburb',
	'neighbourhood',
	'quarter',
	'city_district',
] as const;

function localityFromOsmAddress(
	addr: Record<string, string | undefined>,
): string {
	for (const k of LOCALITY_KEYS) {
		const v = addr[k];
		if (v && String(v).trim()) {
			return String(v).trim();
		}
	}
	return '';
}

/**
 * Maps Nominatim reverse API JSON to city / state / zip for driver location.
 */
export function parseNominatimReverseResponse(
	data: unknown,
): NominatimReverseAddress | null {
	if (!data || typeof data !== 'object') {
		return null;
	}
	const address = (data as { address?: Record<string, string | undefined> })
		.address;
	if (!address) {
		return null;
	}

	const postcode =
		address.postcode ||
		address.postal_code ||
		address['postal code'] ||
		address['addr:postcode'] ||
		'';

	const locality = localityFromOsmAddress(address);
	const city =
		locality ||
		(address.district || '').trim() ||
		(address.neighbourhood || '').trim();
	const state = (address.state || address.region || '').trim();
	const zip = String(postcode).trim();
	const country = (address.country || '').trim();

	if (!city && !state && !zip && !country) {
		return null;
	}

	return {
		city: sanitizeLatinField(city),
		state: sanitizeLatinField(state),
		zip,
		country: sanitizeLatinField(country),
	};
}

/** Cache key: ~11 m precision at mid-latitudes. */
export function reverseGeocodeCacheKey(lat: number, lon: number): string {
	return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
