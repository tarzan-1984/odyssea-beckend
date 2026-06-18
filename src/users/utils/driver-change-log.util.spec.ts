import {
	buildDriverChangeLine,
	buildMobileDriverStatusUpdateChanges,
	buildTmsDriverWebhookUpdateChanges,
} from './driver-change-log.util';

describe('driver-change-log.util', () => {
	const existing = {
		email: 'old@example.com',
		firstName: 'John',
		lastName: 'Doe',
		phone: null,
		driverStatus: null,
		statusDate: null,
		type: null,
		vin: null,
		company: [] as string[],
		isAutoupdate: false,
	};

	it('formats empty old value before arrow', () => {
		expect(buildDriverChangeLine('Status', null, 'available')).toBe(
			'Status: → available',
		);
	});

	it('formats old and new values', () => {
		expect(buildDriverChangeLine('Email', 'a@b.com', 'c@d.com')).toBe(
			'Email: a@b.com → c@d.com',
		);
	});

	it('returns null when values are unchanged', () => {
		expect(buildDriverChangeLine('Status', 'available', 'available')).toBeNull();
	});

	it('builds multi-line TMS driver update log', () => {
		const text = buildTmsDriverWebhookUpdateChanges(existing, {
			email: 'old@example.com',
			firstName: 'John',
			lastName: 'Doe',
			driverStatus: 'available',
			statusDate: '2026-06-17 15:54:00',
		});

		expect(text).toBe(
			'Status: → available\nStatus Date: → 2026-06-17 15:54:00',
		);
	});

	it('skips fields not present in webhook patch', () => {
		const text = buildTmsDriverWebhookUpdateChanges(existing, {
			email: 'old@example.com',
			firstName: 'Jane',
			lastName: 'Doe',
		});

		expect(text).toBe('First Name: John → Jane');
	});

	it('builds mobile status update log with location fields', () => {
		const text = buildMobileDriverStatusUpdateChanges(
			{
				driverStatus: 'loaded_enroute',
				statusDate: '06/18/26 7:24 AM',
				isAutoupdate: false,
				latitude: 40.1,
				longitude: -74.2,
				location: 'NJ',
				city: 'Newark',
				state: 'NJ',
				zip: '07102',
			},
			{
				driverStatus: 'available',
				statusDate: '06/16/2026 16:30',
				isAutoupdate: true,
				latitude: 40.7128,
				longitude: -74.006,
				location: 'NY',
				city: 'New York',
				state: 'NY',
				zip: '10001',
			},
		);

		expect(text).toContain('Status: loaded_enroute → available');
		expect(text).toContain('Latitude: 40.1 → 40.7128');
		expect(text).toContain('City: Newark → New York');
	});
});
