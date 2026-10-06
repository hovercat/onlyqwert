import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRooms, createRoom, joinRoom, snapshotFor, updateSettings } from '#lib/server/rooms.ts';
import { startGame } from '#lib/server/game.ts';
import { LIMITS } from '#lib/types.ts';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});
afterEach(() => {
	__resetRooms();
	vi.useRealTimers();
});

function lobby() {
	const r = createRoom({ hostPlays: false });
	if (!r.ok) throw new Error(r.error);
	const a = joinRoom(r.value, 'Ann');
	if (!a.ok) throw new Error(a.error);
	return r.value;
}

describe('seconds per round', () => {
	it('keeps the 120 s maximum and defaults a new room to 45 s', () => {
		expect(LIMITS.secondsMax).toBe(120);
		const r = createRoom({});
		if (!r.ok) throw new Error(r.error);
		expect(r.value.settings.secondsPerRound).toBe(45);
	});

	it('accepts 120 and the started round lasts exactly 120s', () => {
		const room = lobby();
		expect(updateSettings(room, { secondsPerRound: 120 }).ok).toBe(true);
		expect(startGame(room).ok).toBe(true);
		const snap = snapshotFor(room, {});
		expect(snap.round!.endsAt - snap.round!.startedAt).toBe(120_000);
	});

	it.each([121, 204])('rejects %i with 400 and keeps the previous value', (n) => {
		const room = lobby();
		const res = updateSettings(room, { secondsPerRound: n });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.status).toBe(400);
		expect(room.settings.secondsPerRound).toBe(45);
	});
});
