import { AsyncSemaphore } from './async-semaphore';

describe('AsyncSemaphore', () => {
	it('limits concurrent runners', async () => {
		const sem = new AsyncSemaphore(2);
		let running = 0;
		let peak = 0;

		const task = async () => {
			running += 1;
			peak = Math.max(peak, running);
			await new Promise((r) => setTimeout(r, 30));
			running -= 1;
		};

		await Promise.all([
			sem.run(task),
			sem.run(task),
			sem.run(task),
			sem.run(task),
		]);

		expect(peak).toBe(2);
	});
});
