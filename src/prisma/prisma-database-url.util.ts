export type PrismaPoolParams = {
	connectionLimit: number;
	poolTimeoutSeconds?: number;
	connectTimeoutSeconds?: number;
};

/**
 * Set or replace a query param without parsing the full URL — `new URL()` can
 * break postgres passwords that contain reserved characters.
 */
function setQueryParam(url: string, key: string, value: string): string {
	const re = new RegExp(`([?&])${key}=[^&]*`);
	if (re.test(url)) {
		return url.replace(re, `$1${key}=${value}`);
	}
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}${key}=${value}`;
}

/**
 * Apply Prisma PostgreSQL pool params (always wins over values already in the URL).
 * Render Postgres has a limited max_connections; the Nest app caps each client.
 */
export function withPrismaPoolParams(
	rawUrl: string | undefined,
	params: PrismaPoolParams,
): string | undefined {
	const url = rawUrl?.trim();
	if (!url) {
		return undefined;
	}

	let result = setQueryParam(
		url,
		'connection_limit',
		String(params.connectionLimit),
	);

	if (params.poolTimeoutSeconds !== undefined) {
		result = setQueryParam(
			result,
			'pool_timeout',
			String(params.poolTimeoutSeconds),
		);
	}

	if (params.connectTimeoutSeconds !== undefined) {
		result = setQueryParam(
			result,
			'connect_timeout',
			String(params.connectTimeoutSeconds),
		);
	}

	return result;
}
