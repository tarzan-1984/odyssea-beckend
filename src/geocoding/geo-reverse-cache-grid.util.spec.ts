import { geoReverseCacheGridCell } from './geo-reverse-cache-grid.util';

describe('geoReverseCacheGridCell', () => {
	it('snaps nearby coordinates to the same ~50 m cell', () => {
		const a = geoReverseCacheGridCell(41.998431, -88.169249);
		const b = geoReverseCacheGridCell(41.99851, -88.16918);
		expect(a.gridLat).toBe(b.gridLat);
		expect(a.gridLng).toBe(b.gridLng);
	});

	it('uses different cells when points are far apart', () => {
		const a = geoReverseCacheGridCell(41.998431, -88.169249);
		const b = geoReverseCacheGridCell(42.05, -88.169249);
		expect(a.gridLat).not.toBe(b.gridLat);
	});
});
