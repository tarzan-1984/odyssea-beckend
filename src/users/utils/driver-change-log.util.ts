export type DriverChangeCandidate = {
	label: string;
	oldValue: unknown;
	newValue: unknown;
};

export function formatDriverChangeValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (Array.isArray(value)) {
		return value.length === 0 ? '' : value.map(String).join(', ');
	}
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}
	return String(value).trim();
}

export function buildDriverChangeLine(
	label: string,
	oldValue: unknown,
	newValue: unknown,
): string | null {
	const oldFormatted = formatDriverChangeValue(oldValue);
	const newFormatted = formatDriverChangeValue(newValue);
	if (oldFormatted === newFormatted) {
		return null;
	}
	if (!oldFormatted && newFormatted) {
		return `${label}: → ${newFormatted}`;
	}
	if (oldFormatted && !newFormatted) {
		return `${label}: ${oldFormatted} →`;
	}
	return `${label}: ${oldFormatted} → ${newFormatted}`;
}

export function buildDriverChangesText(
	candidates: DriverChangeCandidate[],
): string {
	return candidates
		.map((candidate) =>
			buildDriverChangeLine(
				candidate.label,
				candidate.oldValue,
				candidate.newValue,
			),
		)
		.filter((line): line is string => line !== null)
		.join('\n');
}

export type ExistingDriverChangeSnapshot = {
	email: string;
	firstName: string;
	lastName: string;
	phone: string | null;
	driverStatus: string | null;
	statusDate: string | null;
	type: string | null;
	vin: string | null;
	company: string[];
	isAutoupdate: boolean;
};

export type TmsDriverWebhookChangePatch = {
	email: string;
	firstName: string;
	lastName: string;
	phone?: string | null;
	driverStatus?: string | null;
	statusDate?: string | null;
	vehicleType?: string | null;
	vin?: string | null;
	company?: string[];
	isAutoupdate?: boolean;
};

/** Builds human-readable driver change log (old → new), excluding location fields. */
export function buildTmsDriverWebhookUpdateChanges(
	existing: ExistingDriverChangeSnapshot,
	patch: TmsDriverWebhookChangePatch,
): string {
	const candidates: DriverChangeCandidate[] = [
		{ label: 'Email', oldValue: existing.email, newValue: patch.email },
		{
			label: 'First Name',
			oldValue: existing.firstName,
			newValue: patch.firstName,
		},
		{
			label: 'Last Name',
			oldValue: existing.lastName,
			newValue: patch.lastName,
		},
	];

	if ('phone' in patch) {
		candidates.push({
			label: 'Phone',
			oldValue: existing.phone,
			newValue: patch.phone,
		});
	}
	if ('driverStatus' in patch) {
		candidates.push({
			label: 'Status',
			oldValue: existing.driverStatus,
			newValue: patch.driverStatus,
		});
	}
	if ('statusDate' in patch) {
		candidates.push({
			label: 'Date Available',
			oldValue: existing.statusDate,
			newValue: patch.statusDate,
		});
	}
	if ('vehicleType' in patch) {
		candidates.push({
			label: 'Vehicle Type',
			oldValue: existing.type,
			newValue: patch.vehicleType,
		});
	}
	if ('vin' in patch) {
		candidates.push({
			label: 'VIN',
			oldValue: existing.vin,
			newValue: patch.vin,
		});
	}
	if ('company' in patch) {
		candidates.push({
			label: 'Company',
			oldValue: existing.company,
			newValue: patch.company,
		});
	}
	if ('isAutoupdate' in patch) {
		candidates.push({
			label: 'Auto Update',
			oldValue: existing.isAutoupdate,
			newValue: patch.isAutoupdate,
		});
	}

	return buildDriverChangesText(candidates);
}
