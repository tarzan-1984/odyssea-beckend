import { inferNorthAmericaCountrySearchOrder } from './north-america-country.util';

describe('inferNorthAmericaCountrySearchOrder', () => {
	it('prefers US for Illinois', () => {
		expect(
			inferNorthAmericaCountrySearchOrder({
				latitude: 41.998431,
				longitude: -88.169249,
			}),
		).toEqual(['US', 'CA', 'MX']);
	});

	it('prefers MX near Mexico City', () => {
		expect(
			inferNorthAmericaCountrySearchOrder({
				latitude: 19.43,
				longitude: -99.13,
			}),
		).toEqual(['MX', 'US']);
	});

	it('prefers CA for Toronto area', () => {
		expect(
			inferNorthAmericaCountrySearchOrder({
				latitude: 43.65,
				longitude: -79.38,
			}),
		).toEqual(['CA', 'US']);
	});

	it('prefers US for Hawaii', () => {
		expect(
			inferNorthAmericaCountrySearchOrder({
				latitude: 21.3,
				longitude: -157.8,
			}),
		).toEqual(['US']);
	});

	it('includes CA for Alaska panhandle', () => {
		expect(
			inferNorthAmericaCountrySearchOrder({
				latitude: 58.3,
				longitude: -134.4,
			}),
		).toEqual(['US', 'CA']);
	});
});
