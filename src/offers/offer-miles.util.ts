export function parseEmptyMiles(raw: unknown): number | null {
	if (raw != null && !Number.isNaN(Number(raw))) {
		return Number(raw);
	}
	return null;
}

/** total_miles = loaded_miles + empty_miles; missing empty miles counts as 0. */
export function calcTotalMiles(
	loadedMiles: number | null,
	emptyMiles: number | null,
): number | null {
	if (loadedMiles == null) return null;
	return loadedMiles + (emptyMiles ?? 0);
}
