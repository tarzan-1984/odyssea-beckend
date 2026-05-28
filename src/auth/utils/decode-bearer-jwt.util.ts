import { jwtDecode } from 'jwt-decode';
import { JwtPayload } from '../auth.service';

/**
 * Reads JWT claims from Authorization header without signature/expiry validation.
 * Used for mobile location pings when full auth is temporarily disabled.
 */
export function decodeBearerJwtPayload(
	authorizationHeader?: string,
): JwtPayload | null {
	if (!authorizationHeader?.startsWith('Bearer ')) {
		return null;
	}
	const token = authorizationHeader.slice('Bearer '.length).trim();
	if (!token) {
		return null;
	}
	try {
		const payload = jwtDecode<JwtPayload>(token);
		if (!payload?.sub?.trim()) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}
