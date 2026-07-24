import { CallHandler, ExecutionContext, HttpException, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import {
	HttpTimingInterceptor,
	colorSlowHttpLog,
	resolveHttpPath,
} from './http-timing.interceptor';

function mockHttpContext(req: Record<string, unknown>, res: { statusCode: number }) {
	return {
		getType: () => 'http' as const,
		switchToHttp: () => ({
			getRequest: () => req,
			getResponse: () => res,
		}),
	} as unknown as ExecutionContext;
}

describe('colorSlowHttpLog', () => {
	it('wraps message in orange ANSI codes', () => {
		const colored = colorSlowHttpLog('[HTTP][SLOW] test');
		expect(colored).toContain('[HTTP][SLOW] test');
		expect(colored).toContain('\x1b[38;5;208m');
		expect(colored).toContain('\x1b[0m');
	});
});

describe('resolveHttpPath', () => {
	it('uses Nest route pattern with baseUrl', () => {
		expect(
			resolveHttpPath({
				baseUrl: '/v1',
				route: { path: '/users/:id/location' },
				originalUrl: '/v1/users/abc/location?x=1',
			} as never),
		).toBe('/v1/users/:id/location');
	});

	it('strips query from originalUrl when route is missing', () => {
		expect(
			resolveHttpPath({
				originalUrl: '/v1/offers/1255?driver_id=1',
			} as never),
		).toBe('/v1/offers/1255');
	});
});

describe('HttpTimingInterceptor', () => {
	let interceptor: HttpTimingInterceptor;
	let warnSpy: jest.SpyInstance;
	let logSpy: jest.SpyInstance;

	beforeEach(() => {
		interceptor = new HttpTimingInterceptor();
		warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
		logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
	});

	afterEach(() => {
		warnSpy.mockRestore();
		logSpy.mockRestore();
		jest.useRealTimers();
	});

	it('warns for slow successful requests', (done) => {
		jest.useFakeTimers();
		const res = { statusCode: 200 };
		const ctx = mockHttpContext(
			{
				method: 'GET',
				baseUrl: '/v1',
				route: { path: '/offers' },
				originalUrl: '/v1/offers',
			},
			res,
		);
		const handler: CallHandler = {
			handle: () => {
				jest.advanceTimersByTime(4_500);
				return of({ ok: true });
			},
		};

		interceptor.intercept(ctx, handler).subscribe({
			next: () => {
				expect(warnSpy).toHaveBeenCalledWith(
					expect.stringContaining('[HTTP][SLOW] GET /v1/offers status=200'),
				);
				expect(warnSpy.mock.calls[0][0]).toContain('\x1b[38;5;208m');
				done();
			},
			error: done,
		});
	});

	it('logs error status from HttpException', (done) => {
		jest.useFakeTimers();
		const res = { statusCode: 200 };
		const ctx = mockHttpContext(
			{
				method: 'POST',
				baseUrl: '/v1',
				route: { path: '/messages' },
				originalUrl: '/v1/messages',
			},
			res,
		);
		const handler: CallHandler = {
			handle: () => {
				jest.advanceTimersByTime(4_100);
				return throwError(() => new HttpException('fail', 400));
			},
		};

		interceptor.intercept(ctx, handler).subscribe({
			next: () => done(new Error('expected error')),
			error: () => {
				expect(warnSpy).toHaveBeenCalledWith(
					expect.stringContaining(
						'[HTTP][SLOW] POST /v1/messages status=400',
					),
				);
				done();
			},
		});
	});

	it('skips websocket contexts', () => {
		const ctx = {
			getType: () => 'ws',
			switchToHttp: () => {
				throw new Error('should not switch to http');
			},
		} as unknown as ExecutionContext;
		const handler: CallHandler = { handle: () => of(null) };
		expect(() => interceptor.intercept(ctx, handler)).not.toThrow();
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
