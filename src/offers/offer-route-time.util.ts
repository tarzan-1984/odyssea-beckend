const OFFER_DATETIME_RANGE_SEP = ' — ';

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

function monthIndexFromName(name: string): number {
	return MONTH_NAMES.findIndex(
		(month) => month.toLowerCase() === name.toLowerCase(),
	);
}

function parse12hClock(
	hour: number,
	minute: number,
	period: string,
): { hour: number; minute: number } {
	let h = hour;
	const p = period.toLowerCase();
	if (p === 'pm' && h < 12) h += 12;
	if (p === 'am' && h === 12) h = 0;
	return { hour: h, minute };
}

function parseLongOfferDateTime(value: string): Date | null {
	const trimmed = value.trim();
	const match = trimmed.match(
		/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i,
	);
	if (!match) return null;

	const day = parseInt(match[1], 10);
	const month = monthIndexFromName(match[2]);
	const year = parseInt(match[3], 10);
	const hour = parseInt(match[4], 10);
	const minute = parseInt(match[5] ?? '0', 10) || 0;
	if (month < 0 || Number.isNaN(day) || Number.isNaN(year) || Number.isNaN(hour)) {
		return null;
	}

	const { hour: h, minute: min } = parse12hClock(hour, minute, match[6]);
	const date = new Date(year, month, day, h, min, 0, 0);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

/** Legacy UI / TMS: "03/24/2026 02:30 pm" */
function parseSlashOfferDateTime(value: string): Date | null {
	const trimmed = value.trim();
	const match = trimmed.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
	);
	if (!match) return null;

	const month = parseInt(match[1], 10) - 1;
	const day = parseInt(match[2], 10);
	const year = parseInt(match[3], 10);
	const hour = parseInt(match[4], 10);
	const minute = parseInt(match[5], 10);
	const { hour: h, minute: min } = parse12hClock(hour, minute, match[6]);
	const date = new Date(year, month, day, h, min, 0, 0);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

function parseOfferDateTimeField(value: string): Date | null {
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.includes(OFFER_DATETIME_RANGE_SEP)) {
		const [startPart] = trimmed
			.split(OFFER_DATETIME_RANGE_SEP)
			.map((part) => part.trim());
		return (
			parseLongOfferDateTime(startPart) ??
			parseSlashOfferDateTime(startPart) ??
			null
		);
	}

	return (
		parseLongOfferDateTime(trimmed) ??
		parseSlashOfferDateTime(trimmed) ??
		null
	);
}

/** TMS load/draft/create expects e.g. "03/26/2026 2:00 pm". */
export function formatOfferRouteTimeForTms(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';

	const alreadyTms = trimmed.match(
		/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i,
	);
	if (alreadyTms) {
		const month = alreadyTms[1].padStart(2, '0');
		const day = alreadyTms[2].padStart(2, '0');
		const year = alreadyTms[3];
		const hour = String(parseInt(alreadyTms[4], 10));
		const minute = alreadyTms[5];
		const period = alreadyTms[6].toLowerCase();
		return `${month}/${day}/${year} ${hour}:${minute} ${period}`;
	}

	const parsed = parseOfferDateTimeField(trimmed);
	if (!parsed) return trimmed;

	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	const year = parsed.getFullYear();
	let hours = parsed.getHours();
	const period = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12 || 12;
	const minutes = String(parsed.getMinutes()).padStart(2, '0');

	return `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
}
