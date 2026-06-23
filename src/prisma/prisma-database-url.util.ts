export type PrismaPoolParams = {
	connectionLimit: number;
	poolTimeoutSeconds?: number;
	connectTimeoutSeconds?: number;
};

/**
 * Append Prisma PostgreSQL pool params when missing from the connection URL.
 * Render Postgres has a low max_connections; cap each Prisma client explicitly.
 */
export function withPrismaPoolParams(
	rawUrl: string | undefined,
	params: PrismaPoolParams,
): string | undefined {
	const url = rawUrl?.trim();
	if (!url) {
		return undefined;
	}

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return url;
	}

	if (!parsed.searchParams.has('connection_limit')) {
		parsed.searchParams.set(
			'connection_limit',
			String(params.connectionLimit),
		);
	}

	if (
		params.poolTimeoutSeconds !== undefined &&
		!parsed.searchParams.has('pool_timeout')
	) {
		parsed.searchParams.set(
			'pool_timeout',
			String(params.poolTimeoutSeconds),
		);
	}

	if (
		params.connectTimeoutSeconds !== undefined &&
		!parsed.searchParams.has('connect_timeout')
	) {
		parsed.searchParams.set(
			'connect_timeout',
			String(params.connectTimeoutSeconds),
		);
	}

	return parsed.toString();
}
