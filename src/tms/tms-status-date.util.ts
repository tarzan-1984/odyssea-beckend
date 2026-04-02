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
