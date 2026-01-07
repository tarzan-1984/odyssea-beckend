import {
	ExceptionFilter,
	Catch,
	ArgumentsHost,
	HttpException,
	HttpStatus,
	Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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

		// Log error details for debugging
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

		const errorResponse = {
			statusCode: status,
			timestamp: new Date().toISOString(),
			path: request.url,
			message:
				typeof message === 'string'
					? message
					: (message as { message?: string }).message || message,
		};

		response.status(status).json(errorResponse);
	}
}
