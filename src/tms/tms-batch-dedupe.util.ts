export type TmsBatchDedupeEntry<T extends { driver_id: number }> = {
	driverId: number;
	item: T;
	/** Higher value wins when multiple DRIVER rows share the same TMS externalId. */
	freshnessMs: number;
	externalId: string;
};

/**
 * One TMS `driver_id` per batch payload — keeps the freshest row when duplicate
 * `users.externalId` exists on multiple DRIVER records.
 */
export function dedupeTmsBatchByDriverId<T extends { driver_id: number }>(
	entries: TmsBatchDedupeEntry<T>[],
): { items: T[]; duplicateCount: number; duplicateExternalIds: string[] } {
	const byDriverId = new Map<number, TmsBatchDedupeEntry<T>>();
	const duplicateExternalIds = new Set<string>();
	let duplicateCount = 0;

	for (const entry of entries) {
		const prev = byDriverId.get(entry.driverId);
		if (!prev) {
			byDriverId.set(entry.driverId, entry);
			continue;
		}
		duplicateCount++;
		duplicateExternalIds.add(entry.externalId);
		if (entry.freshnessMs > prev.freshnessMs) {
			byDriverId.set(entry.driverId, entry);
		}
	}

	return {
		items: [...byDriverId.values()].map((e) => e.item),
		duplicateCount,
		duplicateExternalIds: [...duplicateExternalIds],
	};
}
