import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Faster dead-connection detection than Socket.IO defaults (~45s → ~25s).
 */
export class OdysseaIoAdapter extends IoAdapter {
	createIOServer(port: number, options?: ServerOptions) {
		return super.createIOServer(port, {
			...options,
			pingInterval: 15000,
			pingTimeout: 10000,
		});
	}
}
