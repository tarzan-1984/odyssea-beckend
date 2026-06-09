/** First pick-up and last delivery location from an offer route (for OFFER chat titles). */
export function getRouteEndpoints(
	route: Array<{ location?: string }> | undefined,
): { pickUp: string; delivery: string } {
	if (!Array.isArray(route) || route.length === 0) {
		return { pickUp: '', delivery: '' };
	}
	const first = route[0];
	const last = route[route.length - 1];
	return {
		pickUp: String(first?.location ?? '').trim(),
		delivery: String(last?.location ?? '').trim(),
	};
}

export function getOfferTitleFromRoute(route: unknown, offerId: number): string {
	if (!Array.isArray(route) || route.length === 0) {
		return `Offer #${offerId}`;
	}

	const points = route as Array<{ location?: unknown }>;
	const firstLocation = String(points[0]?.location ?? '').trim();
	const lastLocation = String(
		points.length > 1
			? (points[points.length - 1]?.location ?? '')
			: (points[0]?.location ?? ''),
	).trim();

	if (firstLocation && lastLocation) {
		return `${firstLocation} → ${lastLocation}`;
	}

	return firstLocation || lastLocation || `Offer #${offerId}`;
}
