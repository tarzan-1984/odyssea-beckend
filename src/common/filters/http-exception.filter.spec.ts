import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
	let filter: HttpExceptionFilter;
	let mockResponse: any;
	let mockRequest: any;

	beforeEach(() => {
		filter = new HttpExceptionFilter();
		mockResponse = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		};
		mockRequest = {
			url: '/test',
		};
	});

	it('should handle HttpException correctly', () => {
		const exception = new HttpException(
			'Test error',
			HttpStatus.BAD_REQUEST,
		);
		const mockHost = {
			switchToHttp: () => ({
				getResponse: () => mockResponse,
				getRequest: () => mockRequest,
			}),
		};

		filter.catch(exception, mockHost as any);

		expect(mockResponse.status).toHaveBeenCalledWith(
			HttpStatus.BAD_REQUEST,
		);
		expect(mockResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: HttpStatus.BAD_REQUEST,
				message: 'Test error',
				path: '/test',
			}),
		);
	});

	it('should handle non-HttpException correctly', () => {
		const exception = new Error('Generic error');
		const mockHost = {
			switchToHttp: () => ({
				getResponse: () => mockResponse,
				getRequest: () => mockRequest,
			}),
		};

		filter.catch(exception, mockHost as any);

		expect(mockResponse.status).toHaveBeenCalledWith(
			HttpStatus.INTERNAL_SERVER_ERROR,
		);
		expect(mockResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
				message: 'Internal server error',
				path: '/test',
			}),
		);
	});

	it('should handle HttpException with object response correctly', () => {
		const exception = new HttpException(
			{ message: 'Object error' },
			HttpStatus.BAD_REQUEST,
		);
		const mockHost = {
			switchToHttp: () => ({
				getResponse: () => mockResponse,
				getRequest: () => mockRequest,
			}),
		};

		filter.catch(exception, mockHost as any);

		expect(mockResponse.status).toHaveBeenCalledWith(
			HttpStatus.BAD_REQUEST,
		);
		expect(mockResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: HttpStatus.BAD_REQUEST,
				message: 'Object error',
				path: '/test',
			}),
		);
	});

	it('should handle HttpException with complex response correctly', () => {
		const exception = new HttpException(
			{ error: 'Complex error', details: 'Some details' },
			HttpStatus.BAD_REQUEST,
		);
		const mockHost = {
			switchToHttp: () => ({
				getResponse: () => mockResponse,
				getRequest: () => mockRequest,
			}),
		};

		filter.catch(exception, mockHost as any);

		expect(mockResponse.status).toHaveBeenCalledWith(
			HttpStatus.BAD_REQUEST,
		);
		expect(mockResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: HttpStatus.BAD_REQUEST,
				message: { error: 'Complex error', details: 'Some details' },
				path: '/test',
			}),
		);
	});

	it('should handle HttpException with string response correctly', () => {
		const exception = new HttpException(
			'String error',
			HttpStatus.BAD_REQUEST,
		);
		const mockHost = {
			switchToHttp: () => ({
				getResponse: () => mockResponse,
				getRequest: () => mockRequest,
			}),
		};

		filter.catch(exception, mockHost as any);

		expect(mockResponse.status).toHaveBeenCalledWith(
			HttpStatus.BAD_REQUEST,
		);
		expect(mockResponse.json).toHaveBeenCalledWith(
			expect.objectContaining({
				statusCode: HttpStatus.BAD_REQUEST,
				message: 'String error',
				path: '/test',
			}),
		);
	});
});
