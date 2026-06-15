/**
 * Compares two dotted app version strings (e.g. App Store marketing versions).
 * @returns negative if a < b, zero if equal, positive if a > b
 */
export function compareAppVersions(a: string, b: string): number {
	const parse = (v: string) =>
		v.split(/[.\-]/u).map((part) => {
			const n = parseInt(/^\d+/u.exec(part)?.[0] ?? '0', 10);
			return Number.isFinite(n) ? n : 0;
		});

	const pa = parse(a.trim());
	const pb = parse(b.trim());
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const da = pa[i] ?? 0;
		const db = pb[i] ?? 0;
		if (da < db) return -1;
		if (da > db) return 1;
	}
	return 0;
}

/** True when installed is strictly below minimum; empty/missing installed counts as outdated. */
export function isAppVersionBelowMinimum(
	installed: string | null | undefined,
	minimum: string,
): boolean {
	const min = minimum.trim();
	if (!min) return false;
	const inst = typeof installed === 'string' ? installed.trim() : '';
	if (!inst) return true;
	return compareAppVersions(inst, min) < 0;
}
