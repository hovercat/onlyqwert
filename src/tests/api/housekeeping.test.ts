import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '#lib/types.ts';
import { getRoom, roomCount, sweepIdleRooms } from '#lib/server/rooms.ts';
import { Actor, joined, newRoom, openStream, resetWorld, useFakeClock } from '../helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

describe('idle room sweep', () => {
	it('deletes only rooms idle for more than 2h (strictly)', async () => {
		const a = await newRoom();
		const t0 = Date.now();
		expect(sweepIdleRooms(t0 + LIMITS.roomIdleMs)).toBe(0);
		expect(getRoom(a.code)).toBeDefined();
		expect(sweepIdleRooms(t0 + LIMITS.roomIdleMs + 1)).toBe(1);
		expect(getRoom(a.code)).toBeUndefined();
		expect((await a.snapshot()).status).toBe(404);
	});

	it('runs on its own every 5 minutes and keeps rooms with recent activity', async () => {
		const idle = await newRoom();
		const active = await newRoom();
		await vi.advanceTimersByTimeAsync(LIMITS.roomIdleMs);
		await joined(active, 'Ann'); // touches the room
		await vi.advanceTimersByTimeAsync(LIMITS.sweepIntervalMs);
		expect(getRoom(idle.code)).toBeUndefined();
		expect(getRoom(active.code)).toBeDefined();
		await vi.advanceTimersByTimeAsync(LIMITS.roomIdleMs);
		expect(roomCount()).toBe(0);
	});

	it('game activity counts as activity (a long running game is not swept)', async () => {
		const host = await newRoom({ rounds: 50, secondsPerRound: 120 });
		const ann = await joined(host, 'Ann');
		await openStream(ann);
		await host.start();
		await vi.advanceTimersByTimeAsync(LIMITS.roomIdleMs - 60_000);
		expect(getRoom(host.code)).toBeDefined();
	});

	it('closes streams and stops timers of a swept room', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const s = await openStream(ann);
		await host.start();
		const code = host.code;
		sweepIdleRooms(Date.now() + LIMITS.roomIdleMs + 1);
		await s.flush();
		expect(s.isClosed()).toBe(true);
		expect(s.events().at(-1)).toMatchObject({ event: 'room_closed', data: { reason: 'idle' } });
		expect(vi.getTimerCount()).toBe(1); // idle sweeper only
		await vi.advanceTimersByTimeAsync(LIMITS.roomIdleMs);
		expect(getRoom(code)).toBeUndefined();
	});

	it('all endpoints answer 404 for a swept room', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		sweepIdleRooms(Date.now() + LIMITS.roomIdleMs + 1);
		for (const r of [await ann.snapshot(), await ann.join('Bob'), await host.start(), await ann.guess('x'), await ann.rename('Z'), await host.settings({})]) {
			expect(r.status).toBe(404);
		}
		expect((await new Actor(host.code).events() as Response).status).toBe(404);
	});

	it('frees capacity: a swept room no longer counts towards the room limit', async () => {
		for (let i = 0; i < 3; i++) await newRoom();
		expect(roomCount()).toBe(3);
		sweepIdleRooms(Date.now() + LIMITS.roomIdleMs + 1);
		expect(roomCount()).toBe(0);
	});
});
