import {
	appendDriverTrackingPointCreatedNote,
	buildDriverChangeLine,
	buildMobileDriverStatusUpdateChanges,
	buildTmsDriverWebhookUpdateChanges,
	buildTmsLoadStatusDriverChanges,
} from './driver-change-log.util';

describe('driver-change-log.util', () => {
	const existing = {
		email: 'old@example.com',
		firstName: 'John',
		lastName: 'Doe',
		phone: null,
		driverStatus: null,
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
		});

		expect(text).toBe('Status: → available');
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

	it('appends tracking history point note with load id', () => {
		expect(
			appendDriverTrackingPointCreatedNote(
				'Latitude: 40.1 → 40.2',
				'LOAD-991',
			),
		).toBe(
			'Latitude: 40.1 → 40.2\nTracking History Point: → Created for load LOAD-991',
		);
		expect(appendDriverTrackingPointCreatedNote('', 'LOAD-991')).toBe(
			'Tracking History Point: → Created for load LOAD-991',
		);
	});

	it('builds TMS load status driver change log', () => {
		const text = buildTmsLoadStatusDriverChanges(
			{
				driverStatus: 'available',
				isTracking: false,
				trackingLoadId: null,
			},
			{
				driverStatus: 'loaded_enroute',
				isTracking: true,
				trackingLoadId: '99123',
			},
			{ loadId: '99123', normalizedLoadStatus: 'loaded_enroute' },
		);

		expect(text).toContain(
			'Load Status Change: → loaded_enroute (load 99123)',
		);
		expect(text).toContain('Status: available → loaded_enroute');
		expect(text).toContain('Is Tracking: false → true');
		expect(text).toContain('Tracking Load Id: → 99123');
	});

	it('builds TMS terminal load status cleanup log', () => {
		const text = buildTmsLoadStatusDriverChanges(
			{
				driverStatus: 'loaded_enroute',
				isTracking: true,
				trackingLoadId: '99123',
			},
			{
				driverStatus: 'loaded_enroute',
				isTracking: false,
				trackingLoadId: null,
			},
			{ loadId: '99123', normalizedLoadStatus: 'delivered' },
		);

		expect(text).toContain('Load Status Change: → delivered (load 99123)');
		expect(text).not.toContain('Status: loaded_enroute →');
		expect(text).toContain('Is Tracking: true → false');
		expect(text).toContain('Tracking Load Id: 99123 →');
	});
});
