import { Logger } from '@nestjs/common';
import axios from 'axios';

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

/** Full axios/network error fields for TMS debugging on Render. */
export function serializeTmsRequestError(error: unknown): Record<string, unknown> {
	if (axios.isAxiosError(error)) {
		const responseData = error.response?.data;
		let responsePreview: string | undefined;
		if (responseData != null) {
			responsePreview =
				typeof responseData === 'string'
					? responseData.slice(0, 300)
					: JSON.stringify(responseData).slice(0, 300);
		}
		return {
			isAxiosError: true,
			message: error.message,
			code: error.code,
			status: error.response?.status,
			statusText: error.response?.statusText,
			responsePreview,
		};
	}
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			cause:
				error.cause instanceof Error
					? error.cause.message
					: error.cause != null
						? String(error.cause)
						: undefined,
		};
	}
	return { raw: String(error) };
}
