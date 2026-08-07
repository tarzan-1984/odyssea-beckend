import { BadRequestException } from '@nestjs/common';
import { nowInNewYorkAsNaiveDate } from '../common/utils/ny-wall-clock';

export type LoadBoardPickupFields = {
	pickupEarliest: string;
	pickupLatest?: string | null;
	pickupHours?: string | null;
};

type UsDateParts = { year: number; month: number; day: number };
type TimeParts = { hour: number; minute: number };

/** Parse mm/dd/yyyy or m/d/yyyy (flatpickr m/d/Y). */
export function parseLoadBoardUsDate(value: string): UsDateParts | null {
	const trimmed = value.trim();
	const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!match) return null;

	const month = Number(match[1]);
	const day = Number(match[2]);
	const year = Number(match[3]);
	if (
		!Number.isFinite(month) ||
		!Number.isFinite(day) ||
		!Number.isFinite(year) ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31
	) {
		return null;
	}

	const probe = new Date(Date.UTC(year, month - 1, day));
	if (
		probe.getUTCFullYear() !== year ||
		probe.getUTCMonth() !== month - 1 ||
		probe.getUTCDate() !== day
	) {
		return null;
	}

	return { year, month, day };
}

/** Parse TimePicker values like "12:00 pm" / "9:05 am". */
export function parseLoadBoardPickupHours(value: string): TimeParts | null {
	const trimmed = value.trim().toLowerCase();
	const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
	if (!match) return null;

	let hour = Number(match[1]);
	const minute = Number(match[2]);
	const meridiem = match[3];
	if (
		!Number.isFinite(hour) ||
		!Number.isFinite(minute) ||
		hour < 1 ||
		hour > 12 ||
		minute < 0 ||
		minute > 59
	) {
		return null;
	}

	if (meridiem === 'am') {
		if (hour === 12) hour = 0;
	} else if (hour !== 12) {
		hour += 12;
	}

	return { hour, minute };
}

/**
 * Pickup window end in naive NY wall-clock space (UTC components = NY digits).
 * Uses pickupLatest when set, otherwise pickupEarliest.
 * With hours → that datetime; without → end of that calendar day.
 */
export function resolveLoadBoardPickupDeadline(
	fields: LoadBoardPickupFields,
): Date | null {
	const dateRaw =
		fields.pickupLatest?.trim() || fields.pickupEarliest?.trim() || '';
	const date = parseLoadBoardUsDate(dateRaw);
	if (!date) return null;

	const hoursRaw = fields.pickupHours?.trim();
	if (hoursRaw) {
		const time = parseLoadBoardPickupHours(hoursRaw);
		if (!time) return null;
		return new Date(
			Date.UTC(
				date.year,
				date.month - 1,
				date.day,
				time.hour,
				time.minute,
				0,
			),
		);
	}

	return new Date(
		Date.UTC(date.year, date.month - 1, date.day, 23, 59, 59),
	);
}

export function isLoadBoardPickupExpired(
	fields: LoadBoardPickupFields,
	now: Date = nowInNewYorkAsNaiveDate(),
): boolean {
	const deadline = resolveLoadBoardPickupDeadline(fields);
	if (!deadline) return false;
	return deadline.getTime() < now.getTime();
}

/**
 * Validates pickup earliest / latest / hours for create & edit.
 * Rejects past pickup windows and unparsable values.
 */
export function assertLoadBoardPickupNotInPast(
	fields: LoadBoardPickupFields,
	now: Date = nowInNewYorkAsNaiveDate(),
): void {
	const earliestRaw = fields.pickupEarliest?.trim() || '';
	if (!earliestRaw) {
		throw new BadRequestException('pickupEarliest is required');
	}

	const earliest = parseLoadBoardUsDate(earliestRaw);
	if (!earliest) {
		throw new BadRequestException(
			'pickupEarliest must be a valid date (mm/dd/yyyy)',
		);
	}

	const latestRaw = fields.pickupLatest?.trim() || '';
	if (latestRaw) {
		const latest = parseLoadBoardUsDate(latestRaw);
		if (!latest) {
			throw new BadRequestException(
				'pickupLatest must be a valid date (mm/dd/yyyy)',
			);
		}
		const earliestMs = Date.UTC(
			earliest.year,
			earliest.month - 1,
			earliest.day,
		);
		const latestMs = Date.UTC(latest.year, latest.month - 1, latest.day);
		if (latestMs < earliestMs) {
			throw new BadRequestException(
				'pickupLatest cannot be before pickupEarliest',
			);
		}
	}

	const hoursRaw = fields.pickupHours?.trim() || '';
	if (hoursRaw && !parseLoadBoardPickupHours(hoursRaw)) {
		throw new BadRequestException(
			'pickupHours must be a valid time (e.g. 12:00 pm)',
		);
	}

	const deadline = resolveLoadBoardPickupDeadline(fields);
	if (!deadline) {
		throw new BadRequestException('Unable to resolve pickup date/time');
	}

	if (deadline.getTime() < now.getTime()) {
		throw new BadRequestException(
			'Pick up earliest / Pick up latest / Pick up hours cannot be in the past',
		);
	}
}
