export type PrismaPoolParams = {
	connectionLimit: number;
	poolTimeoutSeconds?: number;
	connectTimeoutSeconds?: number;
};

/**
 * Append Prisma PostgreSQL pool params when missing from the connection URL.
 * Render Postgres has a low max_connections; cap each Prisma client explicitly.
 */
function appendQueryParam(
	url: string,
	key: string,
	value: string,
): string {
	if (new RegExp(`(?:^|[?&])${key}=`).test(url)) {
		return url;
	}
	const separator = url.includes('?') ? '&' : '?';
	return `${url}${separator}${key}=${value}`;
}

/**
 * Append pool params without parsing the full URL — `new URL()` can break
 * postgres passwords that contain reserved characters.
 */
export function withPrismaPoolParams(
	rawUrl: string | undefined,
	params: PrismaPoolParams,
): string | undefined {
	const url = rawUrl?.trim();
	if (!url) {
		return undefined;
	}

	let result = appendQueryParam(
		url,
		'connection_limit',
		String(params.connectionLimit),
	);

	if (params.poolTimeoutSeconds !== undefined) {
		result = appendQueryParam(
			result,
			'pool_timeout',
			String(params.poolTimeoutSeconds),
		);
	}

	if (params.connectTimeoutSeconds !== undefined) {
		result = appendQueryParam(
			result,
			'connect_timeout',
			String(params.connectTimeoutSeconds),
		);
	}

	return result;
}
