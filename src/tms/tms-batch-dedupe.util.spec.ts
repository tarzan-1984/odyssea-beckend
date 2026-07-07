import {
	dedupeTmsBatchByDriverId,
	type TmsBatchDedupeEntry,
} from './tms-batch-dedupe.util';

type Item = { driver_id: number; value: string };

function entry(
	driverId: number,
	value: string,
	freshnessMs: number,
	externalId = String(driverId),
): TmsBatchDedupeEntry<Item> {
	return {
		driverId,
		item: { driver_id: driverId, value },
		freshnessMs,
		externalId,
	};
}

describe('dedupeTmsBatchByDriverId', () => {
	it('returns all items when driver_id values are unique', () => {
		const result = dedupeTmsBatchByDriverId([
			entry(1, 'a', 100),
			entry(2, 'b', 200),
		]);

		expect(result.items).toHaveLength(2);
		expect(result.duplicateCount).toBe(0);
		expect(result.duplicateExternalIds).toEqual([]);
	});

	it('keeps the freshest row for duplicate TMS driver_id', () => {
		const result = dedupeTmsBatchByDriverId([
			entry(2465, 'older', 100, '2465'),
			entry(2465, 'newer', 500, '2465'),
		]);

		expect(result.items).toEqual([{ driver_id: 2465, value: 'newer' }]);
		expect(result.duplicateCount).toBe(1);
		expect(result.duplicateExternalIds).toEqual(['2465']);
	});
});
