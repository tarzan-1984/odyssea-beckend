import { Test, TestingModule } from '@nestjs/testing';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
	let interceptor: TransformInterceptor<any>;

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [TransformInterceptor],
		}).compile();

		interceptor =
			module.get<TransformInterceptor<any>>(TransformInterceptor);
	});

	it('should be defined', () => {
		expect(interceptor).toBeDefined();
	});

	it('should transform data correctly', () => {
		const mockData = { name: 'test', value: 123 };
		const mockCallHandler = {
			handle: () => of(mockData),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: mockData,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle undefined data', () => {
		const mockCallHandler = {
			handle: () => of(undefined),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: undefined,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle null data', () => {
		const mockCallHandler = {
			handle: () => of(null),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: null,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle string data', () => {
		const mockCallHandler = {
			handle: () => of('test'),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: 'test',
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle number data', () => {
		const mockCallHandler = {
			handle: () => of(42),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: 42,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle boolean data', () => {
		const mockCallHandler = {
			handle: () => of(true),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: true,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle array data', () => {
		const mockData = [1, 2, 3];
		const mockCallHandler = {
			handle: () => of(mockData),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: mockData,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle complex object data', () => {
		const mockData = {
			user: { id: 1, name: 'John' },
			settings: { theme: 'dark' },
		};
		const mockCallHandler = {
			handle: () => of(mockData),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: mockData,
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});

	it('should handle Promise data', () => {
		const mockData = { name: 'test', value: 123 };
		const mockCallHandler = {
			handle: () => of(Promise.resolve(mockData)),
		};
		const mockExecutionContext = {
			switchToHttp: () => ({
				getRequest: () => ({ url: '/test' }),
			}),
		};

		const result = interceptor.intercept(
			mockExecutionContext as ExecutionContext,
			mockCallHandler as CallHandler,
		);

		result.subscribe((transformedData) => {
			expect(transformedData).toEqual({
				data: Promise.resolve(mockData),
				timestamp: expect.any(String),
				path: '/test',
			});
		});
	});
});
