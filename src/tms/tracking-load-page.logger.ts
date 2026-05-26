import { Logger } from '@nestjs/common';

/** Grep logs: TRACKING_LOAD_PAGE */
export const TRACKING_LOAD_PAGE_LOG_SEP =
	'------------------------------------------';

export function logTrackingLoadPage(
	logger: Logger,
	step: string,
	details?: Record<string, unknown>,
): void {
	const payload = details ? ` ${JSON.stringify(details)}` : '';
	logger.log(
		`${TRACKING_LOAD_PAGE_LOG_SEP}\n[TRACKING_LOAD_PAGE] ${step}${payload}\n${TRACKING_LOAD_PAGE_LOG_SEP}`,
	);
}
