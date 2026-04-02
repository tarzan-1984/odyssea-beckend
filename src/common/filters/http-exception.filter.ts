import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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

		const skipErrorLog = shouldSkipErrorLogForLocationTestMode(
			status,
			request.url ?? '',
			message,
		);

		// Log error details for debugging
		if (!skipErrorLog) {
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
