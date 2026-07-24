import {
	CallHandler,
	ExecutionContext,
	HttpException,
	Injectable,
	Logger,
	NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { parsePositiveIntEnv } from '../utils/prisma-pool-config';

/** Warn when request exceeds this duration (default 4s). */
const HTTP_SLOW_MS = parsePositiveIntEnv(process.env.HTTP_SLOW_MS, 4_000);

/** Also log (INFO) requests at/above this duration (default 500ms). */
const HTTP_INFO_MS = parsePositiveIntEnv(process.env.HTTP_INFO_MS, 500);

/** When true, log every HTTP request (noisy with driver location pings). */
const HTTP_LOG_ALL =
	String(process.env.HTTP_LOG_ALL ?? '')
		.trim()
		.toLowerCase() === 'true' ||
	String(process.env.HTTP_LOG_ALL ?? '').trim() === '1';

const SKIP_PATH_PREFIXES = ['/docs', '/favicon.ico'];

/** Orange (256-color) — visible in local terminal; Render may also show ANSI. */
const ANSI_ORANGE = '\x1b[38;5;208m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_RESET = '\x1b[0m';

export function colorSlowHttpLog(message: string): string {
	return `${ANSI_ORANGE}${ANSI_BOLD}${message}${ANSI_RESET}`;
}

/**
 * Prefer Nest route pattern (`/users/:id/location`) for aggregation in logs.
 * Fall back to path without query string.
 */
export function resolveHttpPath(req: Request): string {
	const routePath = req.route?.path;
	if (typeof routePath === 'string' && routePath.length > 0) {
		const base = typeof req.baseUrl === 'string' ? req.baseUrl : '';
		return `${base}${routePath}`;
	}
	const raw = req.originalUrl || req.url || '';
	const q = raw.indexOf('?');
	return q >= 0 ? raw.slice(0, q) : raw;
}

function shouldSkipPath(path: string): boolean {
	return SKIP_PATH_PREFIXES.some(
		(prefix) => path === prefix || path.startsWith(`${prefix}/`),
	);
}

function statusFromError(error: unknown): number {
	if (error instanceof HttpException) {
		return error.getStatus();
	}
	if (
		error &&
		typeof error === 'object' &&
		'status' in error &&
		typeof (error as { status: unknown }).status === 'number'
	) {
		return (error as { status: number }).status;
	}
	if (
		error &&
		typeof error === 'object' &&
		'statusCode' in error &&
		typeof (error as { statusCode: unknown }).statusCode === 'number'
	) {
		return (error as { statusCode: number }).statusCode;
	}
	return 500;
}

/**
 * Logs HTTP timing so Render logs show which admin/API paths are slow.
 * Search logs for `[HTTP][SLOW]` after deploy.
 */
@Injectable()
export class HttpTimingInterceptor implements NestInterceptor {
	private readonly logger = new Logger('HTTP');

	intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
		if (context.getType() !== 'http') {
			return next.handle();
		}

		const http = context.switchToHttp();
		const req = http.getRequest<Request>();
		const res = http.getResponse<Response>();

		if (req.method === 'OPTIONS') {
			return next.handle();
		}

		const path = resolveHttpPath(req);
		if (shouldSkipPath(path)) {
			return next.handle();
		}

		const method = req.method;
		const startedAt = Date.now();

		return next.handle().pipe(
			tap({
				next: () => {
					this.emit(method, path, res.statusCode || 200, Date.now() - startedAt);
				},
				error: (error: unknown) => {
					this.emit(
						method,
						path,
						statusFromError(error),
						Date.now() - startedAt,
					);
				},
			}),
		);
	}

	private emit(
		method: string,
		path: string,
		status: number,
		durationMs: number,
	): void {
		const line = `${method} ${path} status=${status} durationMs=${durationMs}`;

		if (durationMs >= HTTP_SLOW_MS) {
			this.logger.warn(colorSlowHttpLog(`[HTTP][SLOW] ${line}`));
			return;
		}

		if (HTTP_LOG_ALL || durationMs >= HTTP_INFO_MS) {
			this.logger.log(`[HTTP] ${line}`);
		}
	}
}
