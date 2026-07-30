import { normalizeRouteForTms } from './offer-route-time.util';

describe('normalizeRouteForTms', () => {
	it.each(['ASAP', 'As soon as possible, negotiable'])(
		'keeps pickup + ASAP delivery (%s) so TMS gets both location types',
		(asapTime) => {
			const route = normalizeRouteForTms(
				[
					{
						type: 'pick_up_location',
						location: 'Chicago, IL 60066',
						time: '30 July 2026 8:00 AM',
					},
					{
						type: 'delivery_location',
						location: 'Burlington, WI 53105',
						time: asapTime,
					},
				],
				'12:00 PM',
			);

			expect(route).toHaveLength(2);
			expect(route[0]).toMatchObject({
				type: 'pick_up_location',
				location: 'Chicago, IL 60066',
				local_date: '2026-07-30',
				time_start: '08:00',
				time_end: '08:00',
				eta_date: '2026-07-30',
				eta_time: '12:00',
			});
			expect(route[1]).toMatchObject({
				type: 'delivery_location',
				location: 'Burlington, WI 53105',
				local_date: '2026-07-30',
				time_start: '08:00',
				time_end: '23:59',
			});
		},
	);

	it('parses normal dated delivery stops unchanged', () => {
		const route = normalizeRouteForTms([
			{
				type: 'pick_up_location',
				location: 'Doral, FL',
				time: '29 July 2026 10:52 AM',
			},
			{
				type: 'delivery_location',
				location: 'New Philadelphia, PA 17959',
				time: '31 July 2026 8:00 AM',
			},
		]);

		expect(route).toEqual([
			{
				type: 'pick_up_location',
				location: 'Doral, FL',
				local_date: '2026-07-29',
				time_start: '10:52',
				time_end: '10:52',
			},
			{
				type: 'delivery_location',
				location: 'New Philadelphia, PA 17959',
				local_date: '2026-07-31',
				time_start: '08:00',
				time_end: '08:00',
			},
		]);
	});
});
