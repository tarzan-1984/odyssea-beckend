/** Multi-participant chat types that behave like classic group chats. */
export const MULTI_USER_CHAT_TYPES = ['GROUP', 'BID'] as const;

export type MultiUserChatType = (typeof MULTI_USER_CHAT_TYPES)[number];

export function isMultiUserChatType(
	type: string | null | undefined,
): type is MultiUserChatType {
	return (
		!!type &&
		(MULTI_USER_CHAT_TYPES as readonly string[]).includes(type)
	);
}
