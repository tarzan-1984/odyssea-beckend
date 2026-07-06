import type { TmsLoadDraftRoutePoint } from '../tms/tms-load-draft.service';

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

function parseSingleOfferDateTime(value: string): Date | null {
	return parseLongOfferDateTime(value) ?? parseSlashOfferDateTime(value);
}

/** "12 PM" or "8:30 AM" — time-only fragment relative to baseDate. */
function parseOfferTimeOnly(value: string, baseDate: Date): Date | null {
	const trimmed = value.trim();
	const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
	if (!match) return null;
	const hour = parseInt(match[1], 10);
	const minute = parseInt(match[2] ?? '0', 10) || 0;
	const { hour: h, minute: min } = parse12hClock(hour, minute, match[3]);
	const date = new Date(baseDate);
	date.setHours(h, min, 0, 0);
	return date;
}

export function parseOfferDateTimeField(value: string): {
	start: Date | null;
	end: Date | null;
} {
	const trimmed = value.trim();
	if (!trimmed) return { start: null, end: null };

	if (trimmed.includes(OFFER_DATETIME_RANGE_SEP)) {
		const [startPart, endPart] = trimmed
			.split(OFFER_DATETIME_RANGE_SEP)
			.map((part) => part.trim());
		const start = parseSingleOfferDateTime(startPart);
		if (!start || !endPart) return { start, end: null };
		const end =
			parseSingleOfferDateTime(endPart) ?? parseOfferTimeOnly(endPart, start);
		return { start, end };
	}

	return { start: parseSingleOfferDateTime(trimmed), end: null };
}

function formatTmsLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatTmsTime24(date: Date): string {
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

/** Converts mobile driver_eta ("9:00 PM") to TMS 24h ("21:00"). */
export function formatDriverEtaForTms(
	driverEta: string | null | undefined,
): string | null {
	const trimmed = driverEta?.trim();
	if (!trimmed) return null;

	const timeOnly = parseOfferTimeOnly(trimmed, new Date(2000, 0, 1));
	if (timeOnly) return formatTmsTime24(timeOnly);

	const parsed = parseSingleOfferDateTime(trimmed);
	if (parsed) return formatTmsTime24(parsed);

	return null;
}

function parseRoutePointTimesForTms(
	timeRaw: string,
): Pick<TmsLoadDraftRoutePoint, 'local_date' | 'time_start' | 'time_end'> | null {
	const { start, end } = parseOfferDateTimeField(timeRaw);
	if (!start) return null;

	const time_start = formatTmsTime24(start);
	const time_end = end ? formatTmsTime24(end) : time_start;

	return {
		local_date: formatTmsLocalDate(start),
		time_start,
		time_end,
	};
}

/**
 * Maps offer route points to TMS load/draft/create route format.
 * eta_date / eta_time are set only on the first pick_up_location from driver_eta.
 */
export function normalizeRouteForTms(
	route: unknown,
	firstPickupDriverEta?: string | null,
): TmsLoadDraftRoutePoint[] {
	if (!Array.isArray(route)) return [];

	const out: TmsLoadDraftRoutePoint[] = [];
	let firstPickupHandled = false;
	const etaTime = formatDriverEtaForTms(firstPickupDriverEta);

	for (const point of route) {
		if (!point || typeof point !== 'object') continue;
		const row = point as Record<string, unknown>;
		const type = String(row.type ?? '').trim();
		const location = String(row.location ?? '').trim();
		const times = parseRoutePointTimesForTms(String(row.time ?? ''));
		if (!type || !location || !times) continue;

		const routePoint: TmsLoadDraftRoutePoint = {
			type,
			location,
			...times,
		};

		if (type === 'pick_up_location' && !firstPickupHandled) {
			firstPickupHandled = true;
			if (etaTime) {
				routePoint.eta_date = times.local_date;
				routePoint.eta_time = etaTime;
			}
		}

		out.push(routePoint);
	}

	return out;
}

/** TMS load/draft/create legacy single-field time, e.g. "03/26/2026 2:00 pm". */
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

	const { start } = parseOfferDateTimeField(trimmed);
	if (!start) return trimmed;

	const month = String(start.getMonth() + 1).padStart(2, '0');
	const day = String(start.getDate()).padStart(2, '0');
	const year = start.getFullYear();
	let hours = start.getHours();
	const period = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12 || 12;
	const minutes = String(start.getMinutes()).padStart(2, '0');

	return `${month}/${day}/${year} ${hours}:${minutes} ${period}`;
}
