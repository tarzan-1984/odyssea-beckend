import { UserRole } from '@prisma/client';

export function canAccessAppSettings(role: UserRole): boolean {
	return role === UserRole.ADMINISTRATOR || role === UserRole.GAST;
}

export function canModifyAppSettings(role: UserRole): boolean {
	return role === UserRole.ADMINISTRATOR;
}

export function canSendCheckListMessages(role: UserRole): boolean {
	return role !== UserRole.GAST;
}

export function canCreateOffers(role: UserRole): boolean {
	return role !== UserRole.GAST;
}

/** Alias: all offer write actions (create, deactivate, drivers, accept, push, etc.). */
export const canModifyOffers = canCreateOffers;
