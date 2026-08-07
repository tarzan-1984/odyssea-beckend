import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LoadBoardShipmentsService } from './load-board-shipments.service';

/** Every minute — unpost posted shipments whose pickup window has passed. */
const LOAD_BOARD_UNPOST_CRON = '0 * * * * *';

@Injectable()
export class LoadBoardUnpostScheduler {
	private readonly logger = new Logger(LoadBoardUnpostScheduler.name);

	constructor(
		private readonly loadBoardShipmentsService: LoadBoardShipmentsService,
	) {}

	@Cron(LOAD_BOARD_UNPOST_CRON, { name: 'load-board-unpost-expired' })
	async handleExpiredPickups(): Promise<void> {
		try {
			const result =
				await this.loadBoardShipmentsService.unpostExpiredPostedShipments();
			if (result.unpostedCount > 0) {
				this.logger.log(
					`Auto-unposted ${result.unpostedCount} load board shipment(s) with expired pickup`,
				);
			}
		} catch (error) {
			this.logger.error('Failed to auto-unpost expired load board shipments', error);
		}
	}
}
