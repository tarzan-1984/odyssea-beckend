/**
 * Mirrors Odyssea-backend-ui TrackingDeliveryMap address parsing /
 * normalization so TMS meta_data yields the same Nominatim candidates.
 */

export type PreferredLoadLocationType = 'pick_up_location' | 'delivery_location';

type LoadLocationLike = {
	address?: string;
	short_address?: string;
	type?: string;
	address_id?: string | number;
};

export type TmsShipperLike = {
	address_id?: string | number;
	id?: string;
	latitude?: string | number | null;
	longitude?: string | number | null;
	full_address?: string;
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

export function getLoadLocationAddressId(
	value: unknown,
	preferredType: PreferredLoadLocationType,
): string | null {
	const location = parseLoadLocation(value, preferredType);
	const addressId = location?.address_id;
	if (addressId == null || String(addressId).trim() === '') {
		return null;
	}
	return String(addressId).trim();
}

export function parseShipperCoordinates(
	shipper: TmsShipperLike,
): { lat: number; lng: number } | null {
	const lat =
		shipper.latitude != null && String(shipper.latitude).trim() !== ''
			? Number(shipper.latitude)
			: NaN;
	const lng =
		shipper.longitude != null && String(shipper.longitude).trim() !== ''
			? Number(shipper.longitude)
			: NaN;
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
		return null;
	}
	return { lat, lng };
}

export function resolveShipperCoords(
	locationValue: unknown,
	preferredType: PreferredLoadLocationType,
	shippers: TmsShipperLike[] | undefined | null,
): { lat: number; lng: number; addressLabel: string } | null {
	if (!Array.isArray(shippers) || shippers.length === 0) {
		return null;
	}

	const addressId = getLoadLocationAddressId(locationValue, preferredType);
	if (!addressId) {
		return null;
	}

	const shipper = shippers.find((entry) => {
		const shipperAddressId = String(entry.address_id ?? entry.id ?? '').trim();
		return shipperAddressId !== '' && shipperAddressId === addressId;
	});
	if (!shipper) {
		return null;
	}

	const coords = parseShipperCoordinates(shipper);
	if (!coords) {
		return null;
	}

	const location = parseLoadLocation(locationValue, preferredType);
	const addressLabel =
		shipper.full_address?.trim() ||
		location?.address?.trim() ||
		location?.short_address?.trim() ||
		(preferredType === 'pick_up_location' ? 'Pick up' : 'Delivery');

	return { ...coords, addressLabel };
}
