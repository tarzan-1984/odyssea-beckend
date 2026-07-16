import { HttpException, Logger } from '@nestjs/common';

export const MESSAGE_SEND_FAILED_PREFIX = '[MESSAGE_SEND_FAILED]';

export type MessageSendTransport = 'websocket' | 'http';

export type MessageSendFailureLogInput = {
	senderUserId: string | null | undefined;
	chatRoomId: string | null | undefined;
	clientMessageId?: string | null;
	transport: MessageSendTransport;
	reason: string;
	senderEmail?: string | null;
	senderName?: string | null;
	senderExternalId?: string | null;
	error?: unknown;
};

function serializeError(error: unknown): Record<string, unknown> | string | undefined {
	if (error == null) {
		return undefined;
	}
	if (error instanceof HttpException) {
		const response = error.getResponse();
		return {
			name: error.name,
			message: error.message,
			status: error.getStatus(),
			response:
				typeof response === 'string'
					? response
					: (response as Record<string, unknown>),
		};
	}
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}
	return String(error);
}

function resolveErrorReason(error: unknown, fallback: string): string {
	if (error instanceof HttpException) {
		const response = error.getResponse();
		if (typeof response === 'string' && response.trim()) {
			return response;
		}
		if (response && typeof response === 'object') {
			const message = (response as { message?: unknown }).message;
			if (typeof message === 'string' && message.trim()) {
				return message;
			}
			if (Array.isArray(message) && message.length > 0) {
				return message.map(String).join('; ');
			}
		}
		return error.message || fallback;
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}
	return fallback;
}

/**
 * Structured log when outbound chat message send fails (WS or HTTP).
 */
export function logMessageSendFailure(
	logger: Logger,
	input: MessageSendFailureLogInput,
): void {
	const reason =
		input.reason?.trim() ||
		resolveErrorReason(input.error, 'Unknown message send failure');
	const senderName = input.senderName?.trim() || '(unknown)';
	const senderEmail = input.senderEmail?.trim() || '(unknown)';
	const senderExternalId = input.senderExternalId?.trim() || '(unknown)';
	const senderUserId = input.senderUserId?.trim() || '(unknown)';
	const chatRoomId = input.chatRoomId?.trim() || '(unknown)';
	const clientMessageId = input.clientMessageId?.trim() || '(none)';

	const lines = [
		MESSAGE_SEND_FAILED_PREFIX,
		'Chat message send did not complete successfully.',
		`transport=${input.transport}`,
		`senderUserId=${senderUserId}`,
		`senderName=${senderName}`,
		`senderEmail=${senderEmail}`,
		`senderExternalId=${senderExternalId}`,
		`chatRoomId=${chatRoomId}`,
		`clientMessageId=${clientMessageId}`,
		`reason=${reason}`,
		`error=${JSON.stringify(serializeError(input.error) ?? null)}`,
	];

	logger.error(lines.join('\n'));
}

export function reasonFromSendError(error: unknown): string {
	return resolveErrorReason(error, 'Unknown message send failure');
}
