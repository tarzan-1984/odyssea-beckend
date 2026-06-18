import {
	compareAppVersions,
	compareAppVersionValues,
	getLowestAppVersion,
	isAppVersionBelowMinimum,
	isRecordedAppVersionBelowMinimum,
} from './app-version.util';

describe('compareAppVersions', () => {
	it('compares dotted versions', () => {
		expect(compareAppVersions('2.1.4', '2.1.6')).toBeLessThan(0);
		expect(compareAppVersions('2.1.6', '2.1.6')).toBe(0);
		expect(compareAppVersions('2.2.0', '2.1.6')).toBeGreaterThan(0);
	});
});

describe('isAppVersionBelowMinimum', () => {
	it('returns false when minimum is empty', () => {
		expect(isAppVersionBelowMinimum('1.0.0', '')).toBe(false);
	});

	it('treats missing installed as below minimum', () => {
		expect(isAppVersionBelowMinimum(null, '2.1.6')).toBe(true);
		expect(isAppVersionBelowMinimum('', '2.1.6')).toBe(true);
	});

	it('detects outdated installed version', () => {
		expect(isAppVersionBelowMinimum('2.1.4', '2.1.6')).toBe(true);
		expect(isAppVersionBelowMinimum('2.1.6', '2.1.6')).toBe(false);
		expect(isAppVersionBelowMinimum('2.2.0', '2.1.6')).toBe(false);
	});
});

describe('isRecordedAppVersionBelowMinimum', () => {
	it('ignores missing installed version', () => {
		expect(isRecordedAppVersionBelowMinimum(null, '2.1.6')).toBe(false);
		expect(isRecordedAppVersionBelowMinimum('', '2.1.6')).toBe(false);
	});

	it('detects outdated recorded version', () => {
		expect(isRecordedAppVersionBelowMinimum('2.1.4', '2.1.6')).toBe(true);
		expect(isRecordedAppVersionBelowMinimum('2.1.6', '2.1.6')).toBe(false);
	});
});

describe('compareAppVersionValues', () => {
	it('sorts empty versions before numeric versions', () => {
		expect(compareAppVersionValues(null, '2.1.0')).toBeLessThan(0);
		expect(compareAppVersionValues('2.1.0', null)).toBeGreaterThan(0);
	});
});

describe('getLowestAppVersion', () => {
	it('returns the lowest version from a list', () => {
		expect(getLowestAppVersion(['2.1.6', '2.1.2', '2.2.0'])).toBe('2.1.2');
		expect(getLowestAppVersion(['2.1.6', null, '2.1.2'])).toBe('');
	});
});
