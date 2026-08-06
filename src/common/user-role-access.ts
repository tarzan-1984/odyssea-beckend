import { UserRole } from '@prisma/client';

export function canAccessAppSettings(role: UserRole): boolean {
	return role === UserRole.ADMINISTRATOR || role === UserRole.GAST;
}

export function canModifyAppSettings(role: UserRole): boolean {
	return role === UserRole.ADMINISTRATOR;
}

/** App Logs page / API: administrators and tracking team leads. */
const APP_LOGS_ALLOWED_ROLES: UserRole[] = [
	UserRole.ADMINISTRATOR,
	UserRole.TRACKING_TL,
];

export function canAccessAppLogs(role: UserRole): boolean {
	return APP_LOGS_ALLOWED_ROLES.includes(role);
}

export function canSendCheckListMessages(role: UserRole): boolean {
	return role !== UserRole.GAST;
}

export function canCreateOffers(role: UserRole): boolean {
	return role !== UserRole.GAST;
}

/** Alias: all offer write actions (create, deactivate, drivers, accept, push, etc.). */
export const canModifyOffers = canCreateOffers;

const BID_RATES_ALLOWED_ROLES: UserRole[] = [
	UserRole.DISPATCHER,
	UserRole.DISPATCHER_TL,
	UserRole.EXPEDITE_MANAGER,
	UserRole.ADMINISTRATOR,
];

export function canAccessBidRates(role: UserRole): boolean {
	return BID_RATES_ALLOWED_ROLES.includes(role);
}

/** Load board page / create shipment API. */
export const LOAD_BOARD_ALLOWED_ROLES: UserRole[] = [
	UserRole.DISPATCHER,
	UserRole.DISPATCHER_TL,
	UserRole.EXPEDITE_MANAGER,
	UserRole.MODERATOR,
	UserRole.ADMINISTRATOR,
	UserRole.NIGHTSHIFT_TRACKING,
	UserRole.MORNING_TRACKING,
	UserRole.TRACKING_TL,
];

export function canAccessLoadBoard(role: UserRole): boolean {
	return LOAD_BOARD_ALLOWED_ROLES.includes(role);
}

/** My Loads chat tab (TMS tracking/teams without subordinates). */
const MY_LOADS_CHAT_TAB_ROLES: UserRole[] = [
	UserRole.TRACKING_TL,
	UserRole.TRACKING_TL_DAYTIME,
	UserRole.TRACKING_TL_NIGHTSHIFT,
	UserRole.TRACKING_TL_MORNINGSHIFT,
];

/** My Team chat tab (TMS tracking/teams with include_subordinates=1). */
const MY_TEAM_CHAT_TAB_ROLES: UserRole[] = [
	UserRole.TRACKING_TL_DAYTIME,
	UserRole.TRACKING_TL_NIGHTSHIFT,
	UserRole.TRACKING_TL_MORNINGSHIFT,
];

export function canAccessMyLoadsChatTab(role: UserRole): boolean {
	return MY_LOADS_CHAT_TAB_ROLES.includes(role);
}

export function canAccessMyTeamChatTab(role: UserRole): boolean {
	return MY_TEAM_CHAT_TAB_ROLES.includes(role);
}

export function canAccessTrackingTeamsApi(role: UserRole): boolean {
	return canAccessMyLoadsChatTab(role);
}
