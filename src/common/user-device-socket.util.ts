/** Socket.io room for a single logged-in mobile installation. */
export function userDeviceSocketRoom(
	userId: string,
	deviceId: string,
): string {
	const uid = userId.trim();
	const did = deviceId.trim();
	if (!uid || !did) {
		return '';
	}
	return `user_device_${uid}_${did}`;
}
