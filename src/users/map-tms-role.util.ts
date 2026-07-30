import { UserRole } from '@prisma/client';

/**
 * Official TMS employee role catalog (slug → label).
 * Slugs are always lowercase as TMS sends/expects them.
 */
export const TMS_ROLE_CATALOG = [
	{ slug: 'dispatcher', label: 'Dispatcher', userRole: UserRole.DISPATCHER },
	{
		slug: 'dispatcher-tl',
		label: 'Dispatcher Team Lead',
		userRole: UserRole.DISPATCHER_TL,
	},
	{
		slug: 'tracking',
		label: 'Tracking Coordinator (Day Shift)',
		userRole: UserRole.TRACKING,
	},
	{
		slug: 'tracking-tl',
		label: 'Tracking Manager',
		userRole: UserRole.TRACKING_TL,
	},
	{
		slug: 'tracking-tl-daytime',
		label: 'Tracking Team Lead (Day Shift)',
		userRole: UserRole.TRACKING_TL_DAYTIME,
	},
	{
		slug: 'tracking-tl-nightshift',
		label: 'Tracking Team Lead (Evening Shift)',
		userRole: UserRole.TRACKING_TL_NIGHTSHIFT,
	},
	{
		slug: 'tracking-tl-morningshift',
		label: 'Tracking Team Lead (Night Shift)',
		userRole: UserRole.TRACKING_TL_MORNINGSHIFT,
	},
	{ slug: 'billing', label: 'Billing', userRole: UserRole.BILLING },
	{ slug: 'recruiter', label: 'Recruiter', userRole: UserRole.RECRUITER },
	{
		slug: 'recruiter-tl',
		label: 'Recruiter Team Leader',
		userRole: UserRole.RECRUITER_TL,
	},
	{ slug: 'accounting', label: 'Accounting', userRole: UserRole.ACCOUNTING },
	{ slug: 'moderator', label: 'Moderator', userRole: UserRole.MODERATOR },
	{
		slug: 'morning_tracking',
		label: 'Tracking Coordinator (Night Shift)',
		userRole: UserRole.MORNING_TRACKING,
	},
	{
		slug: 'nightshift_tracking',
		label: 'Tracking Coordinator (Evening Shift)',
		userRole: UserRole.NIGHTSHIFT_TRACKING,
	},
	{
		slug: 'expedite_manager',
		label: 'Expedite Manager',
		userRole: UserRole.EXPEDITE_MANAGER,
	},
	{ slug: 'hr_manager', label: 'HR Manager', userRole: UserRole.HR_MANAGER },
	{
		slug: 'driver_updates',
		label: 'Driver App Assistant',
		userRole: UserRole.DRIVER_UPDATES,
	},
] as const;

/** Local / non-catalog roles that may still appear inbound (drivers API, legacy). */
const EXTRA_USER_ROLE_TO_TMS_SLUG: Partial<Record<UserRole, string>> = {
	[UserRole.ADMINISTRATOR]: 'administrator',
	[UserRole.DRIVER]: 'driver',
	[UserRole.SUBSCRIBER]: 'subscriber',
	[UserRole.GAST]: 'gast',
};

const USER_ROLE_TO_TMS_SLUG: Record<UserRole, string | null> = {
	[UserRole.ADMINISTRATOR]: EXTRA_USER_ROLE_TO_TMS_SLUG[UserRole.ADMINISTRATOR]!,
	[UserRole.MODERATOR]: 'moderator',
	[UserRole.DISPATCHER]: 'dispatcher',
	[UserRole.DISPATCHER_TL]: 'dispatcher-tl',
	[UserRole.RECRUITER]: 'recruiter',
	[UserRole.RECRUITER_TL]: 'recruiter-tl',
	[UserRole.HR_MANAGER]: 'hr_manager',
	[UserRole.DRIVER]: EXTRA_USER_ROLE_TO_TMS_SLUG[UserRole.DRIVER]!,
	[UserRole.DRIVER_UPDATES]: 'driver_updates',
	[UserRole.TRACKING]: 'tracking',
	[UserRole.TRACKING_TL_DAYTIME]: 'tracking-tl-daytime',
	[UserRole.TRACKING_TL_NIGHTSHIFT]: 'tracking-tl-nightshift',
	[UserRole.TRACKING_TL_MORNINGSHIFT]: 'tracking-tl-morningshift',
	[UserRole.TRACKING_TL]: 'tracking-tl',
	[UserRole.MORNING_TRACKING]: 'morning_tracking',
	[UserRole.NIGHTSHIFT_TRACKING]: 'nightshift_tracking',
	[UserRole.EXPEDITE_MANAGER]: 'expedite_manager',
	[UserRole.ACCOUNTING]: 'accounting',
	[UserRole.BILLING]: 'billing',
	[UserRole.SUBSCRIBER]: EXTRA_USER_ROLE_TO_TMS_SLUG[UserRole.SUBSCRIBER]!,
	[UserRole.GAST]: EXTRA_USER_ROLE_TO_TMS_SLUG[UserRole.GAST]!,
};

/** Official TMS catalog roles first, then local extras. First match wins. */
const TMS_ROLE_PRIORITY: UserRole[] = [
	...TMS_ROLE_CATALOG.map((r) => r.userRole),
	UserRole.ADMINISTRATOR,
	UserRole.DRIVER,
	UserRole.SUBSCRIBER,
	UserRole.GAST,
];

const TMS_SLUG_TO_USER_ROLE = new Map<string, UserRole>([
	...TMS_ROLE_CATALOG.map((r) => [r.slug, r.userRole] as const),
	...Object.entries(EXTRA_USER_ROLE_TO_TMS_SLUG).map(
		([role, slug]) => [slug!, role as UserRole] as const,
	),
	['guest', UserRole.GAST],
]);

const TMS_CATALOG_SLUGS: Set<string> = new Set(
	TMS_ROLE_CATALOG.map((r) => r.slug),
);

/**
 * Map TMS / WordPress role slugs to Prisma UserRole.
 * When multiple roles are present, the first match in {@link TMS_ROLE_PRIORITY} wins.
 */
export function mapTmsRolesToUserRole(
	externalRoles: string[] | null | undefined,
): UserRole {
	const roles = new Set(
		(externalRoles ?? [])
			.map((r) => String(r ?? '').trim().toLowerCase())
			.filter(Boolean),
	);

	for (const role of TMS_ROLE_PRIORITY) {
		const slug = USER_ROLE_TO_TMS_SLUG[role];
		if (slug && roles.has(slug)) {
			return role;
		}
		if (role === UserRole.GAST && roles.has('guest')) {
			return UserRole.GAST;
		}
	}

	return UserRole.DRIVER;
}

/**
 * Map Prisma UserRole to TMS lowercase slug for outbound TMS payloads.
 * Returns only official TMS catalog slugs by default; pass `{ includeExtras: true }`
 * to also map local roles (administrator, driver, subscriber, gast).
 */
export function mapUserRoleToTmsSlug(
	role: UserRole | string | null | undefined,
	options?: { includeExtras?: boolean },
): string | null {
	const normalized = String(role ?? '')
		.trim()
		.toUpperCase()
		.replace(/-/g, '_');
	if (!normalized) {
		return null;
	}

	let slug: string | null = null;

	if (normalized in USER_ROLE_TO_TMS_SLUG) {
		slug = USER_ROLE_TO_TMS_SLUG[normalized as UserRole];
	} else {
		const fromSlug = TMS_SLUG_TO_USER_ROLE.get(normalized.toLowerCase());
		if (fromSlug) {
			slug = USER_ROLE_TO_TMS_SLUG[fromSlug];
		}
	}

	if (!slug) {
		return null;
	}

	if (!options?.includeExtras && !TMS_CATALOG_SLUGS.has(slug)) {
		return null;
	}

	return slug;
}

export function getTmsRoleLabel(slugOrRole: string | UserRole): string | null {
	const slug =
		mapUserRoleToTmsSlug(slugOrRole, { includeExtras: true }) ??
		String(slugOrRole).trim().toLowerCase();
	const entry = TMS_ROLE_CATALOG.find((r) => r.slug === slug);
	return entry?.label ?? null;
}
