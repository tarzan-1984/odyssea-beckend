import {
	formatStatusDateForDriverLog,
	formatStatusDateNyDisplay,
} from './status-date-ny.util';

describe('status-date-ny.util', () => {
	it('formats current instant in NY wall clock', () => {
		const formatted = formatStatusDateNyDisplay(
			new Date('2026-06-18T11:10:00.000Z'),
		);
		expect(formatted).toMatch(/^06\/18\/26 \d{1,2}:\d{2} (AM|PM)$/);
	});

	it('normalizes SQL NY wall-clock statusDate for driver log', () => {
		expect(formatStatusDateForDriverLog('2026-06-18 07:10:00')).toBe(
			'06/18/26 7:10 AM',
		);
	});

	it('keeps MM/DD/YY display statusDate as-is', () => {
		expect(formatStatusDateForDriverLog('06/17/26 8:49 PM')).toBe(
			'06/17/26 8:49 PM',
		);
	});
});
