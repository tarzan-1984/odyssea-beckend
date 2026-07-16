import { BadRequestException, Logger } from '@nestjs/common';
import {
	MESSAGE_SEND_FAILED_PREFIX,
	logMessageSendFailure,
	reasonFromSendError,
} from './message-send-failure.logger';

describe('message-send-failure.logger', () => {
	it('logs sender, chat and reason with MESSAGE_SEND_FAILED prefix', () => {
		const logger = new Logger('test');
		const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

		logMessageSendFailure(logger, {
			transport: 'websocket',
			senderUserId: 'user-1',
			senderName: 'John Doe',
			senderEmail: 'john@example.com',
			senderExternalId: '4307',
			chatRoomId: 'chat-room-1',
			clientMessageId: 'client-msg-1',
			reason: 'You are not a participant in this chat room',
			error: new BadRequestException(
				'You are not a participant in this chat room',
			),
		});

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const logged = String(errorSpy.mock.calls[0][0]);
		expect(logged).toContain(MESSAGE_SEND_FAILED_PREFIX);
		expect(logged).toContain('transport=websocket');
		expect(logged).toContain('senderUserId=user-1');
		expect(logged).toContain('senderName=John Doe');
		expect(logged).toContain('chatRoomId=chat-room-1');
		expect(logged).toContain('clientMessageId=client-msg-1');
		expect(logged).toContain(
			'reason=You are not a participant in this chat room',
		);

		errorSpy.mockRestore();
	});

	it('extracts reason from HttpException response message', () => {
		expect(
			reasonFromSendError(
				new BadRequestException('Message must have non-empty content'),
			),
		).toBe('Message must have non-empty content');
	});
});
