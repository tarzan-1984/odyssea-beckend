import type { LatLng } from './north-america-bbox.util';

export type NorthAmericaCountryCode = 'US' | 'CA' | 'MX';

/**
 * Likely country_code search order for geo_zips lookups.
 * Rough heuristics — border regions may need a fallback country in the list.
 */
export function inferNorthAmericaCountrySearchOrder(
	p: LatLng,
): NorthAmericaCountryCode[] {
	const { latitude: lat, longitude: lng } = p;

	if (lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154) {
		return ['US'];
	}

	if (lat >= 51 && lng >= -179 && lng <= -129) {
		return ['US', 'CA'];
	}

	if (lat <= 32.75 && lng >= -118.5 && lng <= -86) {
		if (lat <= 30.5 || lng >= -106) {
			return ['MX', 'US'];
		}
	}

	// Southern Ontario / Quebec (excludes US Midwest west of ~-82°)
	if (lat >= 42 && lat < 49 && lng >= -82 && lng <= -57) {
		return ['CA', 'US'];
	}

	if (lat >= 49 && lng >= -141 && lng <= -52) {
		return ['CA', 'US'];
	}

	return ['US', 'CA', 'MX'];
}
