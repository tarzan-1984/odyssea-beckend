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

/** Prefer Latin labels; keep original (e.g. Cyrillic) rather than empty — zip-only is worse for UX. */
function latinPreferredField(value: string): string {
	const t = value.trim();
	if (!t) return '';
	const latin = sanitizeLatinField(t);
	return latin || t;
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
	let city =
		locality ||
		(address.district || '').trim() ||
		(address.neighbourhood || '').trim() ||
		(address.county || '').trim();
	let state = (address.state || address.region || address.state_district || '').trim();
	const zip = String(postcode).trim();
	const country = (address.country || '').trim();

	city = latinPreferredField(city);
	state = latinPreferredField(state);
	const countryLabel = latinPreferredField(country);

	if (!city || !state) {
		const displayName = (data as { display_name?: string }).display_name?.trim();
		if (displayName) {
			const segments = displayName.split(',').map((s) => s.trim()).filter(Boolean);
			if (!city && segments[0]) {
				city = latinPreferredField(segments[0]) || segments[0];
			}
			if (!state && segments.length > 1) {
				state = latinPreferredField(segments[1]) || segments[1];
			}
		}
	}

	if (!city && !state && !zip && !countryLabel) {
		return null;
	}

	return {
		city,
		state,
		zip,
		country: countryLabel,
	};
}

/** Cache key: ~11 m precision at mid-latitudes. */
export function reverseGeocodeCacheKey(lat: number, lon: number): string {
	return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
