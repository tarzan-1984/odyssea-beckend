/** Approximate meters per degree of latitude (WGS84). */
const METERS_PER_DEG_LAT = 111_320;

export const GEO_REVERSE_CACHE_CELL_METERS = 50;

export type GeoReverseCacheGridCell = {
	gridLat: number;
	gridLng: number;
	centerLat: number;
	centerLng: number;
};

/**
 * Snap coordinates to a ~50 m grid (cell size varies slightly with latitude).
 */
export function geoReverseCacheGridCell(
	latitude: number,
	longitude: number,
	cellMeters: number = GEO_REVERSE_CACHE_CELL_METERS,
): GeoReverseCacheGridCell {
	const latCellSize = cellMeters / METERS_PER_DEG_LAT;
	const cosLat = Math.cos((latitude * Math.PI) / 180);
	const lngCellSize =
		cellMeters / (METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 0.01));

	const gridLat = Math.round(latitude / latCellSize);
	const gridLng = Math.round(longitude / lngCellSize);

	return {
		gridLat,
		gridLng,
		centerLat: gridLat * latCellSize,
		centerLng: gridLng * lngCellSize,
	};
}
