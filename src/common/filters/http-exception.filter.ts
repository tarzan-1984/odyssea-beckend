import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
	extractUserIdFromLocationPath,
	httpExceptionMessage,
	isUserLocationUpdatePath,
	logLocationUpdateFailure,
} from '../../users/utils/location-update-failure.logger';

/** Avoid ERROR-level spam when non-test drivers hit PUT .../location in test mode (expected 403). */
function shouldSkipErrorLogForLocationTestMode(
	status: number,
	requestUrl: string,
	responseBody: string | object,
): boolean {
	if (status !== HttpStatus.FORBIDDEN) {
		return false;
	}
	if (!requestUrl.includes('/location')) {
		return false;
	}
	const text =
		typeof responseBody === 'string'
			? responseBody
			: typeof responseBody === 'object' &&
					responseBody !== null &&
					'message' in responseBody
				? String(
						(responseBody as { message: unknown }).message ?? '',
					)
				: JSON.stringify(responseBody);
	return text.includes('test mode');
}

function isValidationPipeResponse(message: string | object): boolean {
	if (Array.isArray(message)) {
		return true;
	}
	if (typeof message === 'object' && message !== null) {
		const msg = (message as { message?: unknown }).message;
		return Array.isArray(msg);
	}
	return false;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	private readonly logger = new Logger(HttpExceptionFilter.name);

	catch(exception: unknown, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse<Response>();
		const request = ctx.getRequest<Request>();

		const status =
			exception instanceof HttpException
				? exception.getStatus()
				: HttpStatus.INTERNAL_SERVER_ERROR;

		const message =
			exception instanceof HttpException
				? exception.getResponse()
				: 'Internal server error';

		const requestUrl = request.url ?? '';
		const requestMethod = request.method ?? '';
		const isLocationPut = isUserLocationUpdatePath(requestUrl, requestMethod);
		const locationUserId =
			extractUserIdFromLocationPath(requestUrl) ?? 'unknown';

		const skipErrorLog = shouldSkipErrorLogForLocationTestMode(
			status,
			requestUrl,
			message,
		);

		// Business failures on PUT /users/:id/location are logged in UsersService.
		const skipGenericLog =
			isLocationPut && exception instanceof HttpException;

		if (isLocationPut && status === HttpStatus.BAD_REQUEST && isValidationPipeResponse(message)) {
			logLocationUpdateFailure(this.logger, {
				userId: locationUserId,
				externalId: null,
				source: 'validation',
				httpStatus: status,
				reason:
					'Request body failed DTO validation before location update handler ran (class-validator).',
				trace: { urlParamUserId: locationUserId },
				payload: request.body,
				details: {
					validationErrors: message,
				},
			});
		}

		if (isLocationPut && !(exception instanceof HttpException)) {
			logLocationUpdateFailure(this.logger, {
				userId: locationUserId,
				externalId: null,
				source: 'unknown',
				httpStatus: status,
				reason: httpExceptionMessage(exception),
				trace: { urlParamUserId: locationUserId },
				payload: request.body,
				error: exception,
			});
		}

		// Log error details for debugging
		if (!skipErrorLog && !skipGenericLog) {
			if (status === HttpStatus.BAD_REQUEST) {
				this.logger.error(`❌ [Validation Error] Path: ${request.url}`);
				this.logger.error(`❌ [Validation Error] Method: ${request.method}`);
				this.logger.error(`❌ [Validation Error] Status: ${status}`);
				this.logger.error(`❌ [Validation Error] Request Body: ${JSON.stringify(request.body, null, 2)}`);
				this.logger.error(`❌ [Validation Error] Error Message: ${JSON.stringify(message, null, 2)}`);
			} else {
				this.logger.error(`❌ [Error] Path: ${request.url}, Status: ${status}`);
				this.logger.error(`❌ [Error] Message: ${JSON.stringify(message, null, 2)}`);
			}
		}

		if (typeof message === 'object' && message !== null && !Array.isArray(message)) {
			const body = message as Record<string, unknown>;
			response.status(status).json({
				statusCode: (body['statusCode'] as number) ?? status,
				timestamp: new Date().toISOString(),
				path: request.url,
				...body,
			});
			return;
		}

		const errorResponse = {
			statusCode: status,
			timestamp: new Date().toISOString(),
			path: request.url,
			message: typeof message === 'string' ? message : String(message),
		};

		response.status(status).json(errorResponse);
	}
}
