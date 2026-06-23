import { withPrismaPoolParams } from './prisma-database-url.util';

describe('withPrismaPoolParams', () => {
	it('adds pool params when missing', () => {
		const url = withPrismaPoolParams(
			'postgresql://user:pass@host:5432/db?sslmode=require',
			{ connectionLimit: 8, poolTimeoutSeconds: 20, connectTimeoutSeconds: 15 },
		);

		expect(url).toContain('connection_limit=8');
		expect(url).toContain('pool_timeout=20');
		expect(url).toContain('connect_timeout=15');
		expect(url).toContain('sslmode=require');
	});

	it('does not override existing connection_limit', () => {
		const url = withPrismaPoolParams(
			'postgresql://user:pass@host:5432/db?connection_limit=3',
			{ connectionLimit: 8 },
		);

		expect(url).toContain('connection_limit=3');
	});
});
