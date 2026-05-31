/** Rough bounding boxes for USA / Canada / Mexico (intentionally permissive). */
export type LatLng = { latitude: number; longitude: number };

type BBox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

function inBox(p: LatLng, b: BBox): boolean {
	return (
		p.latitude >= b.minLat &&
		p.latitude <= b.maxLat &&
		p.longitude >= b.minLng &&
		p.longitude <= b.maxLng
	);
}

const US_CA_MAINLAND: BBox = { minLat: 24, maxLat: 71, minLng: -168, maxLng: -52 };
const ALASKA: BBox = { minLat: 51, maxLat: 72, minLng: -179, maxLng: -129 };
const HAWAII: BBox = { minLat: 18, maxLat: 23, minLng: -161, maxLng: -154 };
const MEXICO: BBox = { minLat: 14, maxLat: 33, minLng: -119, maxLng: -86 };

export function isAllowedNorthAmericaLatLng(p: LatLng): boolean {
	if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) {
		return false;
	}
	return (
		inBox(p, US_CA_MAINLAND) ||
		inBox(p, ALASKA) ||
		inBox(p, HAWAII) ||
		inBox(p, MEXICO)
	);
}
