import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
	let app: INestApplication;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	it('/ (GET)', () => {
		return request(app.getHttpServer()).get('/').expect(200);
	});

	it('should have health check endpoint', () => {
		return request(app.getHttpServer()).get('/health').expect(200);
	});

	it('should handle 404 for non-existent routes', () => {
		return request(app.getHttpServer())
			.get('/non-existent-route')
			.expect(404);
	});

	it('should have proper CORS headers', () => {
		return request(app.getHttpServer())
			.get('/')
			.expect('Access-Control-Allow-Origin', '*')
			.expect(200);
	});

	it('should have proper content type headers', () => {
		return request(app.getHttpServer())
			.get('/')
			.expect('Content-Type', /json/)
			.expect(200);
	});
});

describe('Auth Endpoints (e2e)', () => {
	let app: INestApplication;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	describe('/auth/login (POST)', () => {
		it('should return 400 for invalid email format', () => {
			return request(app.getHttpServer())
				.post('/auth/login')
				.send({
					email: 'invalid-email',
					password: 'password123',
				})
				.expect(400);
		});

		it('should return 400 for missing password', () => {
			return request(app.getHttpServer())
				.post('/auth/login')
				.send({
					email: 'test@example.com',
				})
				.expect(400);
		});

		it('should return 400 for short password', () => {
			return request(app.getHttpServer())
				.post('/auth/login')
				.send({
					email: 'test@example.com',
					password: '123',
				})
				.expect(400);
		});

		it('should return 401 for non-existent user', () => {
			return request(app.getHttpServer())
				.post('/auth/login')
				.send({
					email: 'nonexistent@example.com',
					password: 'password123',
				})
				.expect(401);
		});
	});

	describe('/auth/verify-otp (POST)', () => {
		it('should return 400 for invalid email format', () => {
			return request(app.getHttpServer())
				.post('/auth/verify-otp')
				.send({
					email: 'invalid-email',
					otp: '123456',
				})
				.expect(400);
		});

		it('should return 400 for missing OTP', () => {
			return request(app.getHttpServer())
				.post('/auth/verify-otp')
				.send({
					email: 'test@example.com',
				})
				.expect(400);
		});
	});

	describe('/auth/forgot-password (POST)', () => {
		it('should return 400 for invalid email format', () => {
			return request(app.getHttpServer())
				.post('/auth/forgot-password')
				.send({
					email: 'invalid-email',
				})
				.expect(400);
		});

		it('should return 200 for valid email format', () => {
			return request(app.getHttpServer())
				.post('/auth/forgot-password')
				.send({
					email: 'test@example.com',
				})
				.expect(200);
		});
	});

	describe('/auth/reset-password (POST)', () => {
		it('should return 400 for missing token', () => {
			return request(app.getHttpServer())
				.post('/auth/reset-password')
				.send({
					newPassword: 'newpassword123',
				})
				.expect(400);
		});

		it('should return 400 for short password', () => {
			return request(app.getHttpServer())
				.post('/auth/reset-password')
				.send({
					token: 'reset-token',
					newPassword: '123',
				})
				.expect(400);
		});
	});

	describe('/auth/refresh (POST)', () => {
		it('should return 400 for missing refresh token', () => {
			return request(app.getHttpServer())
				.post('/auth/refresh')
				.send({})
				.expect(400);
		});
	});

	describe('/auth/logout (POST)', () => {
		it('should return 400 for missing refresh token', () => {
			return request(app.getHttpServer())
				.post('/auth/logout')
				.send({})
				.expect(400);
		});

		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer())
				.post('/auth/logout')
				.send({
					refreshToken: 'refresh-token',
				})
				.expect(401);
		});
	});
});

describe('Users Endpoints (e2e)', () => {
	let app: INestApplication;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	describe('/users (GET)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer()).get('/users').expect(401);
		});
	});

	describe('/users/profile (GET)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer())
				.get('/users/profile')
				.expect(401);
		});
	});

	describe('/users/:id (GET)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer()).get('/users/1').expect(401);
		});
	});

	describe('/users (POST)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer())
				.post('/users')
				.send({
					email: 'test@example.com',
					password: 'password123',
					firstName: 'John',
					lastName: 'Doe',
					role: 'DRIVER',
				})
				.expect(401);
		});
	});

	describe('/users/:id (PUT)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer())
				.put('/users/1')
				.send({
					firstName: 'Jane',
				})
				.expect(401);
		});
	});

	describe('/users/:id (DELETE)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer()).delete('/users/1').expect(401);
		});
	});

	describe('/users/:id/status (PUT)', () => {
		it('should return 401 without JWT token', () => {
			return request(app.getHttpServer())
				.put('/users/1/status')
				.send({
					status: 'SUSPENDED',
				})
				.expect(401);
		});
	});
});

describe('Rate Limiting (e2e)', () => {
	let app: INestApplication;

	beforeEach(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		await app.init();
	});

	afterEach(async () => {
		await app.close();
	});

	it('should apply rate limiting to login endpoint', async () => {
		const requests = Array(6)
			.fill(null)
			.map(() =>
				request(app.getHttpServer()).post('/auth/login').send({
					email: 'test@example.com',
					password: 'password123',
				}),
			);

		const responses = await Promise.all(requests);

		// First 5 requests should succeed (200 or 401)
		for (let i = 0; i < 5; i++) {
			expect([200, 401]).toContain(responses[i].status);
		}

		// 6th request should be rate limited (429)
		expect(responses[5].status).toBe(429);
	});

	it('should apply rate limiting to forgot password endpoint', async () => {
		const requests = Array(4)
			.fill(null)
			.map(() =>
				request(app.getHttpServer())
					.post('/auth/forgot-password')
					.send({
						email: 'test@example.com',
					}),
			);

		const responses = await Promise.all(requests);

		// First 3 requests should succeed (200)
		for (let i = 0; i < 3; i++) {
			expect(responses[i].status).toBe(200);
		}

		// 4th request should be rate limited (429)
		expect(responses[3].status).toBe(429);
	});
});
