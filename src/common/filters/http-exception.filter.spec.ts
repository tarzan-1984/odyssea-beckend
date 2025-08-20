import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HttpExceptionFilter],
    }).compile();

    filter = module.get<HttpExceptionFilter>(HttpExceptionFilter);
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  it('should transform HttpException to standard error response', () => {
    const exception = new HttpException('Test error message', HttpStatus.BAD_REQUEST);
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockRequest = {
      url: '/test-endpoint',
      method: 'POST',
    };

    filter.catch(exception, mockResponse as any, mockRequest as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Test error message',
      error: 'Bad Request',
      timestamp: expect.any(String),
      path: '/test-endpoint',
      method: 'POST',
    });
  });

  it('should handle different HTTP status codes', () => {
    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockRequest = {
      url: '/users/999',
      method: 'GET',
    };

    filter.catch(exception, mockResponse as any, mockRequest as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.NOT_FOUND,
      message: 'Not found',
      error: 'Not Found',
      timestamp: expect.any(String),
      path: '/users/999',
      method: 'GET',
    });
  });

  it('should handle internal server errors', () => {
    const exception = new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockRequest = {
      url: '/auth/login',
      method: 'POST',
    };

    filter.catch(exception, mockResponse as any, mockRequest as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      timestamp: expect.any(String),
      path: '/auth/login',
      method: 'POST',
    });
  });

  it('should include timestamp in response', () => {
    const exception = new HttpException('Test error', HttpStatus.BAD_REQUEST);
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockRequest = {
      url: '/test',
      method: 'GET',
    };

    filter.catch(exception, mockResponse as any, mockRequest as any);

    const responseCall = mockResponse.json.mock.calls[0][0];
    expect(responseCall.timestamp).toBeDefined();
    expect(typeof responseCall.timestamp).toBe('string');
    
    // Verify timestamp is a valid ISO date string
    const timestamp = new Date(responseCall.timestamp);
    expect(timestamp.getTime()).not.toBeNaN();
  });

  it('should handle exceptions without specific error message', () => {
    const exception = new HttpException('', HttpStatus.UNAUTHORIZED);
    const mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const mockRequest = {
      url: '/protected',
      method: 'GET',
    };

    filter.catch(exception, mockResponse as any, mockRequest as any);

    expect(mockResponse.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.UNAUTHORIZED,
      message: '',
      error: 'Unauthorized',
      timestamp: expect.any(String),
      path: '/protected',
      method: 'GET',
    });
  });
});
