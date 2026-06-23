import { GeoPostgisReverseGeocodeService } from './geo-postgis-reverse-geocode.service';
import { GeoPrismaService } from '../prisma/geo-prisma.service';

describe('GeoPostgisReverseGeocodeService', () => {
	const geoPrisma = {
		isConnected: true,
		$queryRaw: jest.fn(),
	};

	let service: GeoPostgisReverseGeocodeService;

	beforeEach(() => {
		jest.clearAllMocks();
		service = new GeoPostgisReverseGeocodeService(
			geoPrisma as unknown as GeoPrismaService,
		);
	});

	it('returns contains match for the primary country without nearest lookup', async () => {
		geoPrisma.$queryRaw.mockResolvedValueOnce([
			{
				city: 'Hanover Park',
				state: 'Illinois',
				state_code: 'IL',
				zip: '60133',
				country_code: 'US',
			},
		]);

		const result = await service.reverseGeocode(41.998431, -88.169249);

		expect(result).toMatchObject({
			city: 'Hanover Park',
			stateCode: 'IL',
			match: 'contains',
		});
		expect(geoPrisma.$queryRaw).toHaveBeenCalledTimes(1);
	});

	it('falls back to bounded nearest search when contains misses', async () => {
		geoPrisma.$queryRaw
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([
				{
					city: 'Nearby',
					state: 'Illinois',
					state_code: 'IL',
					zip: '60100',
					country_code: 'US',
				},
			]);

		const result = await service.reverseGeocode(41.998431, -88.169249);

		expect(result).toMatchObject({
			city: 'Nearby',
			match: 'nearest',
		});
		expect(geoPrisma.$queryRaw.mock.calls.length).toBeGreaterThan(1);
	});
});
