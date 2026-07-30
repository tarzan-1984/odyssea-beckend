import { UserRole } from '@prisma/client';
import {
	getTmsRoleLabel,
	mapTmsRolesToUserRole,
	mapUserRoleToTmsSlug,
	TMS_ROLE_CATALOG,
} from './map-tms-role.util';

describe('mapTmsRolesToUserRole', () => {
	it('maps all official TMS catalog slugs', () => {
		for (const entry of TMS_ROLE_CATALOG) {
			expect(mapTmsRolesToUserRole([entry.slug])).toBe(entry.userRole);
		}
	});

	it('is case-insensitive', () => {
		expect(mapTmsRolesToUserRole(['Tracking-TL-Daytime'])).toBe(
			UserRole.TRACKING_TL_DAYTIME,
		);
	});

	it('defaults unknown roles to DRIVER', () => {
		expect(mapTmsRolesToUserRole(['unknown-role'])).toBe(UserRole.DRIVER);
		expect(mapTmsRolesToUserRole([])).toBe(UserRole.DRIVER);
	});
});

describe('mapUserRoleToTmsSlug', () => {
	it('maps catalog UserRoles to lowercase TMS slugs', () => {
		for (const entry of TMS_ROLE_CATALOG) {
			expect(mapUserRoleToTmsSlug(entry.userRole)).toBe(entry.slug);
		}
	});

	it('hides local extras by default', () => {
		expect(mapUserRoleToTmsSlug(UserRole.ADMINISTRATOR)).toBeNull();
		expect(mapUserRoleToTmsSlug(UserRole.DRIVER)).toBeNull();
		expect(mapUserRoleToTmsSlug(UserRole.GAST)).toBeNull();
	});

	it('returns extras when includeExtras is true', () => {
		expect(mapUserRoleToTmsSlug(UserRole.DRIVER, { includeExtras: true })).toBe(
			'driver',
		);
		expect(
			mapUserRoleToTmsSlug(UserRole.ADMINISTRATOR, { includeExtras: true }),
		).toBe('administrator');
	});

	it('returns null for unknown roles', () => {
		expect(mapUserRoleToTmsSlug('NOT_A_ROLE')).toBeNull();
		expect(mapUserRoleToTmsSlug(null)).toBeNull();
	});

	it('round-trips catalog roles', () => {
		for (const entry of TMS_ROLE_CATALOG) {
			const slug = mapUserRoleToTmsSlug(entry.userRole);
			expect(slug).toBe(entry.slug);
			expect(mapTmsRolesToUserRole([slug!])).toBe(entry.userRole);
		}
	});
});

describe('getTmsRoleLabel', () => {
	it('returns TMS labels for catalog roles', () => {
		expect(getTmsRoleLabel(UserRole.TRACKING_TL_MORNINGSHIFT)).toBe(
			'Tracking Team Lead (Night Shift)',
		);
		expect(getTmsRoleLabel('morning_tracking')).toBe(
			'Tracking Coordinator (Night Shift)',
		);
		expect(getTmsRoleLabel('nightshift_tracking')).toBe(
			'Tracking Coordinator (Evening Shift)',
		);
	});
});
