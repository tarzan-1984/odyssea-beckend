/** Parse a positive int env override; fall back when missing/invalid. */
export function parsePositiveIntEnv(
	raw: string | undefined,
	fallback: number,
): number {
	const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
	if (!Number.isFinite(parsed) || parsed < 1) {
		return fallback;
	}
	return parsed;
}

/**
 * Interactive `$transaction` options for latency-sensitive paths (chat).
 * Default Prisma maxWait is 2s — too short when location bursts occupy the pool.
 */
export const CHAT_INTERACTIVE_TX = {
	/** Wait up to 10s for a free pool connection before failing. */
	maxWait: 10_000,
	/** Allow the transaction body up to 15s once started. */
	timeout: 15_000,
} as const;
