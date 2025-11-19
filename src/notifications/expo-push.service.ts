import { Injectable, Logger } from '@nestjs/common';

type ExpoMessage = {
	to: string;
	title?: string;
	body?: string;
	data?: any;
	channelId?: string;
	sound?: string | null;
	priority?: 'default' | 'normal' | 'high';
	largeIcon?: string; // For Android notification icon
};

@Injectable()
export class ExpoPushService {
	private readonly logger = new Logger(ExpoPushService.name);
	private readonly endpoint = 'https://exp.host/--/api/v2/push/send';

	async send(messages: ExpoMessage[]): Promise<void> {
		if (!messages.length) return;
		// Chunk to be safe (Expo suggests up to 100)
		const chunkSize = 90;
		for (let i = 0; i < messages.length; i += chunkSize) {
			const chunk = messages.slice(i, i + chunkSize);
			try {
				const res = await fetch(this.endpoint, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(chunk.length === 1 ? chunk[0] : chunk),
				});
				if (!res.ok) {
					const t = await res.text().catch(() => '');
					this.logger.warn(`Expo push failed: ${res.status} ${t}`);
				}
			} catch (e) {
				this.logger.warn(`Expo push error: ${(e as Error).message}`);
			}
		}
	}
}
