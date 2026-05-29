import { parseHereRevgeocodeResponse } from './here-revgeocode.util';

describe('parseHereRevgeocodeResponse', () => {
	it('parses HERE revgeocode item address', () => {
		const result = parseHereRevgeocodeResponse({
			items: [
				{
					title: 'lululemon athletica',
					resultType: 'place',
					position: { lat: 43.65304, lng: -79.38064 },
					address: {
						label:
							'lululemon athletica, 218 Yonge St, Toronto, ON M5B 2H6, Canada',
						street: 'Yonge St',
						houseNumber: '218',
						city: 'Toronto',
						state: 'Ontario',
						stateCode: 'ON',
						postalCode: 'M5B 2H6',
						countryCode: 'CAN',
						countryName: 'Canada',
					},
				},
			],
		});

		expect(result).toEqual({
			title: 'lululemon athletica',
			resultType: 'place',
			position: { lat: 43.65304, lng: -79.38064 },
			address: {
				label:
					'lululemon athletica, 218 Yonge St, Toronto, ON M5B 2H6, Canada',
				street: 'Yonge St',
				houseNumber: '218',
				city: 'Toronto',
				state: 'Ontario',
				stateCode: 'ON',
				postalCode: 'M5B 2H6',
				countryCode: 'CAN',
				countryName: 'Canada',
			},
		});
	});

	it('strips Cyrillic from address fields', () => {
		const result = parseHereRevgeocodeResponse({
			items: [
				{
					position: { lat: 43.65, lng: -79.38 },
					address: {
						label: '218 Yonge St, Toronto, Канада',
						city: 'Toronto',
						countryName: 'Канада',
						postalCode: 'M5B 2H6',
					},
				},
			],
		});

		expect(result?.address.label).toBe('218 Yonge St, Toronto');
		expect(result?.address.countryName).toBe('');
		expect(result?.address.city).toBe('Toronto');
	});
});
