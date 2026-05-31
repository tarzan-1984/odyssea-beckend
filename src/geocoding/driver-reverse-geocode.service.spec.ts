import { DriverReverseGeocodeService } from './driver-reverse-geocode.service';
import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { GeoReverseCacheService } from './geo-reverse-cache.service';
import { HerePlaywrightReverseGeocodeService } from './here-playwright-reverse-geocode.service';
import { NominatimReverseGeocodeService } from './nominatim-reverse-geocode.service';

describe('DriverReverseGeocodeService', () => {
	const geoPostgis = { reverseGeocode: jest.fn() };
	const geoReverseCache = {
		findByCoordinates: jest.fn(),
		upsertFromReverseGeocode: jest.fn(),
	};
	const here = { reverseGeocode: jest.fn() };
	const nominatim = { reverseGeocode: jest.fn() };

	let service: DriverReverseGeocodeService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new DriverReverseGeocodeService(
			geoPostgis as unknown as GeoPostgisReverseGeocodeService,
			geoReverseCache as unknown as GeoReverseCacheService,
			here as unknown as HerePlaywrightReverseGeocodeService,
			nominatim as unknown as NominatimReverseGeocodeService,
		);
	});

	it('uses Nominatim only for coordinates outside North America', async () => {
		nominatim.reverseGeocode.mockResolvedValue({
			city: 'Kyiv',
			state: 'Kyiv City',
			zip: '01001',
			country: 'Ukraine',
		});
		geoReverseCache.findByCoordinates.mockResolvedValue(null);

		const result = await service.reverseGeocode(50.4501, 30.5234);

		expect(result?.source).toBe('nominatim');
		expect(result?.city).toBe('Kyiv');
		expect(geoPostgis.reverseGeocode).not.toHaveBeenCalled();
		expect(here.reverseGeocode).not.toHaveBeenCalled();
		expect(geoReverseCache.findByCoordinates).not.toHaveBeenCalled();
		expect(geoReverseCache.upsertFromReverseGeocode).not.toHaveBeenCalled();
	});

	it('uses PostGIS chain inside North America', async () => {
		geoPostgis.reverseGeocode.mockResolvedValue({
			city: 'Hanover Park',
			state: 'Illinois',
			stateCode: 'IL',
			zip: '60133',
			countryCode: 'US',
			match: 'contains',
		});

		const result = await service.reverseGeocode(41.998431, -88.169249);

		expect(result?.source).toBe('geo_zips');
		expect(nominatim.reverseGeocode).not.toHaveBeenCalled();
	});
});
