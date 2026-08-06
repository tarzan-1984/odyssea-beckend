/**
 * Strip per-user chat list fields before broadcasting chatRoomUpdated.
 * Unread / mute / pin live on chat_room_participants and must be pushed
 * only via personal channels (user_${id} / chatUnreadCountUpdated).
 */
export function stripPerUserChatRoomFields<T extends Record<string, unknown>>(
	patch: T,
): Omit<T, 'unreadCount' | 'isMuted' | 'isPinned'> {
	const {
		unreadCount: _unreadCount,
		isMuted: _isMuted,
		isPinned: _isPinned,
		...safe
	} = patch;
	return safe;
}
