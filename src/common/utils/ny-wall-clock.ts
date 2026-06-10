export const AMERICA_NEW_YORK_TZ = 'America/New_York';

const NY_LOCALE_FORMAT_OPTS: Intl.DateTimeFormatOptions = {
	timeZone: AMERICA_NEW_YORK_TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
};

/** America/New_York wall time as locale string (MM/DD/YYYY, HH:mm:ss) for TEXT columns. */
export function nowInNewYorkAsLocaleString(now: Date = new Date()): string {
	return now.toLocaleString('en-US', NY_LOCALE_FORMAT_OPTS);
}

/**
 * Parses NY wall-clock strings stored in TEXT columns (offers.update_time).
 * Supports locale format (MM/DD/YYYY, HH:mm:ss) and SQL-like (YYYY-MM-DD HH:mm:ss).
 */
export function parseNyLocaleStringToNaiveDate(value: string): Date | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	const localeMatch = trimmed.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})$/,
	);
	if (localeMatch) {
		const [, month, day, year, hour, minute, second] = localeMatch;
		return new Date(
			Date.UTC(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second),
			),
		);
	}

	const sqlMatch = trimmed.match(
		/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
	);
	if (sqlMatch) {
		const [, year, month, day, hour, minute, second] = sqlMatch;
		return new Date(
			Date.UTC(
				Number(year),
				Number(month) - 1,
				Number(day),
				Number(hour),
				Number(minute),
				Number(second),
			),
		);
	}

	return null;
}

/** NY wall-clock naive Date for the instant minus N whole hours. */
export function getNyWallClockHoursAgo(
	hours: number,
	now: Date = new Date(),
): Date {
	const nyNow = instantToTimeZoneNaiveDate(now, AMERICA_NEW_YORK_TZ);
	return new Date(nyNow.getTime() - hours * 60 * 60 * 1000);
}

/** True when a stored NY locale string is strictly older than N hours (NY wall clock). */
export function isNyLocaleStringOlderThanHours(
	value: string,
	hours: number,
	now: Date = new Date(),
): boolean {
	const parsed = parseNyLocaleStringToNaiveDate(value);
	if (!parsed) return false;
	return parsed.getTime() < getNyWallClockHoursAgo(hours, now).getTime();
}

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
 * Converts a real UTC instant (e.g. legacy participant.joinedAt) into the same
 * naive NY wall-clock space used by message.createdAt.
 */
export function utcInstantToNyNaiveDate(instant: Date): Date {
	return instantToTimeZoneNaiveDate(instant, AMERICA_NEW_YORK_TZ);
}

/** createdAt + updatedAt for a newly created chat room (naive NY, same as messages). */
export function newChatRoomTimestamps(now: Date = nowInNewYorkAsNaiveDate()) {
	return { createdAt: now, updatedAt: now };
}

/** joinedAt for a user added to a chat (naive NY, same as messages). */
export function newParticipantJoinedAt(now: Date = nowInNewYorkAsNaiveDate()): Date {
	return now;
}

/** Normalize an external instant (e.g. TMS ts) into naive NY for DB storage. */
export function parseInstantToNyNaiveDate(value: string | Date): Date {
	const instant = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(instant.getTime())) {
		return nowInNewYorkAsNaiveDate();
	}
	return instantToTimeZoneNaiveDate(instant, AMERICA_NEW_YORK_TZ);
}
