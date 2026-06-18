import {
	buildDriverChangeLine,
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
			'Status: → available\nDate Available: → 2026-06-17 15:54:00',
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
});
