import {
	normalizeTmsCurrentLocation,
	resolveTmsLocationCode,
} from './tms-current-location.util';

describe('tms-current-location.util', () => {
	describe('resolveTmsLocationCode', () => {
		it('returns TMS code from geo_zips state_code', () => {
			expect(resolveTmsLocationCode('MI', 'Michigan')).toBe('MI');
			expect(resolveTmsLocationCode('QC', 'Quebec')).toBe('QC');
		});

		it('resolves full state name when state_code empty', () => {
			expect(resolveTmsLocationCode('', 'Michigan')).toBe('MI');
			expect(resolveTmsLocationCode(undefined, 'Quebec')).toBe('QC');
		});

		it('returns empty string when unresolved', () => {
			expect(resolveTmsLocationCode('', '')).toBe('');
			expect(resolveTmsLocationCode('Not A Region')).toBe('');
		});
	});

	describe('normalizeTmsCurrentLocation', () => {
		it('falls back to NY when unresolved', () => {
			expect(normalizeTmsCurrentLocation('')).toBe('NY');
			expect(normalizeTmsCurrentLocation(null)).toBe('NY');
		});

		it('maps Michigan to MI', () => {
			expect(normalizeTmsCurrentLocation('Michigan')).toBe('MI');
		});
	});
});
