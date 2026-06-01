import type { DriverReverseGeocodeResult } from './driver-reverse-geocode.types';
import { resolveTmsLocationCode } from '../tms/tms-current-location.util';

export type DriverLocationPersistedFields = {
	latitude?: number | null;
	longitude?: number | null;
	location?: string | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
};

function formatCoord(value: number | null | undefined): string {
	return typeof value === 'number' && Number.isFinite(value)
		? value.toFixed(6)
		: '—';
}

function quoteField(value: string | null | undefined): string {
	return `"${(value ?? '').replace(/"/g, "'")}"`;
}

/** TMS location + city/state/zip (+ coords) for ServerGeocode hit lines. */
export function formatServerGeocodeResolvedLog(
	tag: string,
	latitude: number,
	longitude: number,
	fields: Pick<
		DriverReverseGeocodeResult,
		'city' | 'state' | 'stateCode' | 'zip'
	>,
): string {
	const tmsLocation =
		resolveTmsLocationCode(fields.stateCode, fields.state) || '(unmapped)';
	return (
		`[ServerGeocode] ${tag} — ` +
		`lat=${formatCoord(latitude)} lng=${formatCoord(longitude)} ` +
		`location=${tmsLocation} ` +
		`city=${quoteField(fields.city)} ` +
		`state=${quoteField(fields.state)} ` +
		`zip=${quoteField(fields.zip)}`
	);
}

/** Values persisted on users after location update (authoritative DB snapshot). */
export function formatDriverLocationPersistedLog(
	context: string,
	user: DriverLocationPersistedFields,
	addressSource?: string | null,
	extra?: Record<string, string>,
): string {
	const parts = [
		context,
		`lat=${formatCoord(user.latitude)}`,
		`lng=${formatCoord(user.longitude)}`,
		`location=${quoteField(user.location)}`,
		`city=${quoteField(user.city)}`,
		`state=${quoteField(user.state)}`,
		`zip=${quoteField(user.zip)}`,
	];
	if (addressSource) {
		parts.push(`addressSource=${addressSource}`);
	}
	if (extra) {
		for (const [key, value] of Object.entries(extra)) {
			parts.push(`${key}=${value}`);
		}
	}
	return parts.join(' ');
}
