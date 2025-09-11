// Request types for better type safety
export interface AuthenticatedRequest {
	user: {
		id: string;
		email: string;
		role: string;
	};
}

export interface StateData {
	frontendUrl?: string;
}

export interface ErrorWithResponse extends Error {
	response?: {
		data?: any;
	};
}

export interface AxiosError extends Error {
	response?: {
		data?: any;
	};
	message: string;
}

export interface WebSocketContext {
	switchToWs(): {
		getClient(): any;
	};
}

export interface JwtPayload {
	sub: string;
	role: string;
	email?: string;
}

export interface ChatRoomData {
	id: string;
	name: string;
	type: string;
}

export interface MessageData {
	id: string;
	content: string;
	sender?: {
		firstName: string;
		lastName: string;
	};
}

export interface UserData {
	id: string;
	email: string;
	firstName: string;
	lastName: string;
}

export interface ChatData {
	chatRoom: ChatRoomData;
	messages: MessageData[];
	unreadCount: number;
}

export interface NotificationUserData {
	user: UserData;
	chats: ChatData[];
}
