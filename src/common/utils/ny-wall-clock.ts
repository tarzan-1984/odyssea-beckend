export const AMERICA_NEW_YORK_TZ = 'America/New_York';

/**
 * Builds a Date whose UTC components match the target TZ wall-clock time.
 * Use when storing `timestamp without time zone` in PostgreSQL (naive local time).
 */
export function instantToTimeZoneNaiveDate(
	instant: Date,
	timeZone: string = AMERICA_NEW_YORK_TZ,
): Date {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	}).formatToParts(instant);

	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? '';
	const year = Number(get('year'));
	const month = Number(get('month'));
	const day = Number(get('day'));
	const hour = Number(get('hour'));
	const minute = Number(get('minute'));
	const second = Number(get('second'));

	return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

export function nowInTimeZoneAsNaiveDate(
	timeZone: string = AMERICA_NEW_YORK_TZ,
): Date {
	return instantToTimeZoneNaiveDate(new Date(), timeZone);
}

/** Current wall-clock time in America/New_York as a naive Date for DB storage. */
export function nowInNewYorkAsNaiveDate(): Date {
	return nowInTimeZoneAsNaiveDate(AMERICA_NEW_YORK_TZ);
}

/**
 * Converts a real UTC instant (e.g. participant.joinedAt) into the same naive
 * NY wall-clock space used by message.createdAt for apples-to-apples comparison.
 */
export function utcInstantToNyNaiveDate(instant: Date): Date {
	return instantToTimeZoneNaiveDate(instant, AMERICA_NEW_YORK_TZ);
}
