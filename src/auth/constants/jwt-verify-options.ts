/** Verify JWT signature and claims but allow expired access tokens. */
export const JWT_VERIFY_ALLOW_EXPIRED_OPTIONS = {
	ignoreExpiration: true,
} as const;
