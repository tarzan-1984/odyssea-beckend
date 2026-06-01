import {
	formatDriverLocationPersistedLog,
	formatServerGeocodeResolvedLog,
} from './driver-location-save-log.util';

describe('driver-location-save-log.util', () => {
	it('formatServerGeocodeResolvedLog includes coords and four address fields', () => {
		const line = formatServerGeocodeResolvedLog('geo_zips contains', 42.123456, -83.654321, {
			city: 'Capac',
			state: 'Michigan',
			stateCode: 'MI',
			zip: '48014',
		});
		expect(line).toContain('lat=42.123456');
		expect(line).toContain('lng=-83.654321');
		expect(line).toContain('location=MI');
		expect(line).toContain('city="Capac"');
		expect(line).toContain('state="Michigan"');
		expect(line).toContain('zip="48014"');
	});

	it('formatDriverLocationPersistedLog mirrors DB row', () => {
		const line = formatDriverLocationPersistedLog(
			'Location update saved to DB',
			{
				latitude: 42.1,
				longitude: -83.2,
				location: 'MI',
				city: 'Capac',
				state: 'Michigan',
				zip: '48014',
			},
			'geo_zips:contains',
		);
		expect(line).toContain('location="MI"');
		expect(line).toContain('addressSource=geo_zips:contains');
	});
});
