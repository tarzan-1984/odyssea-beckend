/**
 * TMS location batch (cron): for `loaded_enroute` only, send status_date as
 * (now + 3 hours) expressed in America/New_York, formatted like 01/15/2024 10:30 AM.
 * For any other driver status, send an empty string.
 */
export function formatTmsBatchStatusDateByDriverStatus(
	driverStatus: string | null | undefined,
): string {
	const n = driverStatus?.trim().toLowerCase() ?? '';
	if (n !== 'loaded_enroute') {
		return '';
	}
	const shifted = new Date(Date.now() + 3 * 60 * 60 * 1000);
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: 'America/New_York',
		month: '2-digit',
		day: '2-digit',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});
	// e.g. "04/16/2026, 10:30 AM" → "04/16/2026 10:30 AM"
	return dtf.format(shifted).replace(',', '').replace(/\s+/g, ' ').trim();
}

/**
 * Format status date for TMS (aligned with legacy mobile formatStatusDate).
 */
export function formatTmsStatusDate(statusDate?: string | null): string {
	const now = new Date();
	const hours = now.getHours();
	const minutes = String(now.getMinutes()).padStart(2, '0');
	const ampm = hours >= 12 ? 'PM' : 'AM';
	const displayHours = hours % 12 || 12;

	if (!statusDate || statusDate.trim() === '') {
		const month = String(now.getMonth() + 1).padStart(2, '0');
		const day = String(now.getDate()).padStart(2, '0');
		const year = now.getFullYear();
		return `${month}/${day}/${year} ${displayHours}:${minutes} ${ampm}`;
	}

	const trimmed = statusDate.trim();
	const timeMatch = trimmed.match(
		/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i,
	);
	if (timeMatch) {
		const datePart = timeMatch[1];
		const timePart = timeMatch[2];
		const dateSegments = datePart.split('/');
		if (dateSegments.length === 3) {
			let year = parseInt(dateSegments[2], 10);
			if (year < 100) year += 2000;
			return `${dateSegments[0]}/${dateSegments[1]}/${year} ${timePart}`;
		}
	}
	return `${trimmed} ${displayHours}:${minutes} ${ampm}`;
}
