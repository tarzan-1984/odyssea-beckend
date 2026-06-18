import {
	AMERICA_NEW_YORK_TZ,
	parseNyLocaleStringToNaiveDate,
} from './ny-wall-clock';

/** Driver statusDate storage/display: MM/DD/YY h:mm AM/PM in America/New_York. */
export function formatStatusDateNyDisplay(instant: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: AMERICA_NEW_YORK_TZ,
		month: '2-digit',
		day: '2-digit',
		year: '2-digit',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	}).formatToParts(instant);
	const get = (type: string) =>
		parts.find((part) => part.type === type)?.value ?? '';
	return `${get('month')}/${get('day')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

/** Normalize stored statusDate for driver_logs (NY wall-clock display). */
export function formatStatusDateForDriverLog(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	const trimmed = String(value).trim();
	if (!trimmed) {
		return '';
	}

	const sqlMatch = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
	);
	if (sqlMatch) {
		const [, year, month, day, hour, minute] = sqlMatch;
		const hourNum = Number(hour);
		const ampm = hourNum >= 12 ? 'PM' : 'AM';
		const hour12 = hourNum % 12 || 12;
		return `${month}/${day}/${year.slice(-2)} ${hour12}:${minute} ${ampm}`;
	}

	const nyLocale = parseNyLocaleStringToNaiveDate(trimmed);
	if (nyLocale) {
		return formatStatusDateNyDisplay(nyLocale);
	}

	return trimmed;
}
