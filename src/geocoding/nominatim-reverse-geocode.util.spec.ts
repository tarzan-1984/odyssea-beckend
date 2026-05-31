import {
	parseNominatimReverseResponse,
	reverseGeocodeCacheKey,
} from './nominatim-reverse-geocode.util';

describe('nominatim-reverse-geocode.util', () => {
	it('parseNominatimReverseResponse extracts city, state, zip', () => {
		const result = parseNominatimReverseResponse({
			address: {
				city: 'Miami',
				state: 'Florida',
				postcode: '33101',
			},
		});
		expect(result).toEqual({
			city: 'Miami',
			state: 'Florida',
			zip: '33101',
			country: '',
		});
	});

	it('parseNominatimReverseResponse keeps Cyrillic when Latin unavailable', () => {
		const result = parseNominatimReverseResponse({
			display_name: 'Миколаїв, Миколаївська область, Україна',
			address: {
				postcode: '54058',
				state: 'Миколаївська область',
				country: 'Україна',
			},
		});
		expect(result?.zip).toBe('54058');
		expect(result?.city).toBe('Миколаїв');
		expect(result?.state).toBe('Миколаївська область');
	});

	it('parseNominatimReverseResponse returns null when address empty', () => {
		expect(parseNominatimReverseResponse({})).toBeNull();
		expect(parseNominatimReverseResponse({ address: {} })).toBeNull();
	});

	it('reverseGeocodeCacheKey rounds to 4 decimals', () => {
		expect(reverseGeocodeCacheKey(40.7123456, -74.006789)).toBe(
			'40.7123,-74.0068',
		);
	});
});
