/**
 * Mirrors Odyssea-backend-ui TrackingDeliveryMap address parsing /
 * normalization so TMS meta_data yields the same Nominatim candidates.
 */

export type PreferredLoadLocationType = 'pick_up_location' | 'delivery_location';

type LoadLocationLike = {
	address?: string;
	short_address?: string;
	type?: string;
};

function normalizeLoadLocationType(type: unknown): string {
	return String(type ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
}

function parseLoadLocation(
	value: unknown,
	preferredType: PreferredLoadLocationType,
): LoadLocationLike | null {
	if (!value) return null;

	try {
		const parsed = typeof value === 'string' ? JSON.parse(value) : value;
		const locations = Array.isArray(parsed) ? parsed : [parsed];
		const typedLocation = locations.find(
			(location) =>
				location &&
				typeof location === 'object' &&
				normalizeLoadLocationType((location as LoadLocationLike).type) === preferredType,
		);
		const fallbackLocation = locations.find((location) => location && typeof location === 'object');
		const location = typedLocation ?? fallbackLocation;
		if (!location || typeof location !== 'object') return null;
		return location as LoadLocationLike;
	} catch {
		return null;
	}
}

function normalizeAddressForGeocoding(address: string): string {
	return address
		.replace(/\bN\.?\s*E\.?\b/gi, 'NE')
		.replace(/\bN\.?\s*W\.?\b/gi, 'NW')
		.replace(/\bS\.?\s*E\.?\b/gi, 'SE')
		.replace(/\bS\.?\s*W\.?\b/gi, 'SW')
		.replace(/\bAVENUE\b/gi, 'Ave')
		.replace(/\bSTREET\b/gi, 'St')
		.replace(/\bROAD\b/gi, 'Rd')
		.replace(/\s+/g, ' ')
		.trim();
}

export function getLoadLocationAddressCandidates(
	value: unknown,
	preferredType: PreferredLoadLocationType,
): string[] {
	const location = parseLoadLocation(value, preferredType);
	const candidates = [
		location?.address?.trim(),
		location?.address ? normalizeAddressForGeocoding(location.address) : null,
		location?.short_address?.trim(),
	].filter((candidate): candidate is string => Boolean(candidate));

	return Array.from(new Set(candidates));
}
