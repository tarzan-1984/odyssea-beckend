/**
 * Limits how many async tasks run at once. Excess callers wait in FIFO order.
 * Used to keep bursty background work from exhausting the Prisma connection pool.
 */
export class AsyncSemaphore {
	private available: number;
	private readonly waiters: Array<() => void> = [];

	constructor(private readonly maxConcurrent: number) {
		if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1) {
			throw new Error('AsyncSemaphore maxConcurrent must be >= 1');
		}
		this.available = maxConcurrent;
	}

	get max(): number {
		return this.maxConcurrent;
	}

	async run<T>(task: () => Promise<T>): Promise<T> {
		await this.acquire();
		try {
			return await task();
		} finally {
			this.release();
		}
	}

	private acquire(): Promise<void> {
		if (this.available > 0) {
			this.available -= 1;
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.waiters.push(resolve);
		});
	}

	private release(): void {
		const next = this.waiters.shift();
		if (next) {
			next();
			return;
		}
		this.available += 1;
	}
}
