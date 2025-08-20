import { Test, TestingModule } from '@nestjs/testing';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TransformInterceptor],
    }).compile();

    interceptor = module.get<TransformInterceptor>(TransformInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should transform successful response with data', (done) => {
    const mockData = { id: 1, name: 'Test User' };
    const mockCallHandler = {
      handle: () => of(mockData),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: mockData,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response without data', (done) => {
    const mockCallHandler = {
      handle: () => of(undefined),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: undefined,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response with null data', (done) => {
    const mockCallHandler = {
      handle: () => of(null),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: null,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response with empty string data', (done) => {
    const mockCallHandler = {
      handle: () => of(''),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: '',
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response with number data', (done) => {
    const mockCallHandler = {
      handle: () => of(42),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: 42,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response with boolean data', (done) => {
    const mockCallHandler = {
      handle: () => of(true),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: true,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should transform successful response with array data', (done) => {
    const mockData = [{ id: 1 }, { id: 2 }];
    const mockCallHandler = {
      handle: () => of(mockData),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: mockData,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });

  it('should include valid timestamp in response', (done) => {
    const mockCallHandler = {
      handle: () => of('test'),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value.timestamp).toBeDefined();
        expect(typeof value.timestamp).toBe('string');
        
        // Verify timestamp is a valid ISO date string
        const timestamp = new Date(value.timestamp);
        expect(timestamp.getTime()).not.toBeNaN();
        done();
      },
      error: done,
    });
  });

  it('should preserve error responses without transformation', (done) => {
    const mockError = new Error('Test error');
    const mockCallHandler = {
      handle: () => {
        throw mockError;
      },
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: () => {
        done.fail('Should not call next');
      },
      error: (error) => {
        expect(error).toBe(mockError);
        done();
      },
    });
  });

  it('should handle async responses correctly', (done) => {
    const mockData = { async: true };
    const mockCallHandler = {
      handle: () => of(Promise.resolve(mockData)),
    };

    const result = interceptor.intercept({} as ExecutionContext, mockCallHandler as CallHandler);

    result.subscribe({
      next: (value) => {
        expect(value).toEqual({
          success: true,
          data: mockData,
          timestamp: expect.any(String),
        });
        done();
      },
      error: done,
    });
  });
});
