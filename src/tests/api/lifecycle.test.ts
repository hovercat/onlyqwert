import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, playerCookieName } from '#lib/types.ts';
import { Actor, answerOf, joined, newRoom, openStream, resetWorld, useFakeClock } from '../helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

describe('PATCH /api/rooms/[code]/settings', () => {
	it('lets the host update some fields and keeps the rest', async () => {
		const host = await newRoom({ rounds: 4, secondsPerRound: 15 });
		const r = await host.settings({ rounds: 9, generations: [2, 1] });
		expect(r.status).toBe(200);
		expect(r.body.settings).toEqual({ generations: [1, 2], rounds: 9, secondsPerRound: 15, hostPlays: false });
		expect(host.room.settings).toEqual(r.body.settings);
	});

	it('403 for players and anonymous visitors, and the settings stay untouched', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		expect((await ann.settings({ rounds: 9 })).status).toBe(403);
		expect((await new Actor(host.code).settings({ rounds: 9 })).status).toBe(403);
		expect(host.room.settings.rounds).toBe(2);
	});

	it('403 for a forged host cookie, 404 for an unknown room', async () => {
		const host = await newRoom();
		const evil = new Actor(host.code);
		evil.jar.set(`oq_host_${host.code}`, 'forged');
		expect((await evil.settings({ rounds: 9 })).status).toBe(403);
		expect((await new Actor('ZZZZZZ').settings({})).status).toBe(404);
	});

	it.each([
		{ rounds: 0 },
		{ rounds: 51 },
		{ secondsPerRound: 4 },
		{ secondsPerRound: 121 },
		{ generations: [] },
		{ generations: [10] },
		{ hostPlays: 'true' }
	])('400 for invalid %j and nothing is applied', async (body) => {
		const host = await newRoom();
		const before = structuredClone(host.room.settings);
		const r = await host.settings({ ...body, rounds: (body as { rounds?: number }).rounds ?? 5 });
		expect(r.status).toBe(400);
		expect(host.room.settings).toEqual(before);
	});

	it('409 once the game is not in the lobby anymore', async () => {
		const host = await newRoom();
		await joined(host, 'Ann');
		await host.start();
		expect((await host.settings({ rounds: 3 })).status).toBe(409);
		expect(host.room.settings.rounds).toBe(2);
	});

	it('an empty or malformed body is a no-op 200', async () => {
		const host = await newRoom();
		expect((await host.settings({})).status).toBe(200);
		expect((await host.settings(undefined)).status).toBe(200);
	});

	it('toggling hostPlays adds and removes the host player and (re)sets the cookie', async () => {
		const host = await newRoom();
		expect(host.room.players.size).toBe(0);
		expect((await host.settings({ hostPlays: true })).status).toBe(200);
		expect(host.room.players.size).toBe(1);
		expect(host.jar.get(playerCookieName(host.code))).toBe(host.me!.token);
		await host.settings({ hostPlays: false });
		expect(host.room.players.size).toBe(0);
		await host.settings({ hostPlays: true });
		expect(host.room.players.size).toBe(1);
	});

	it('adds the host player under a free name if a player already took the host name', async () => {
		const host = await newRoom();
		await joined(host, 'Host');
		await host.settings({ hostPlays: true });
		const names = [...host.room.players.values()].map((p) => p.name);
		expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(2);
	});
});

describe('start / next / restart permissions and transitions', () => {
	it('start: needs the host, at least one player and the lobby phase', async () => {
		const host = await newRoom();
		expect((await host.start()).status).toBe(409); // no players
		const ann = await joined(host, 'Ann');
		expect((await ann.start()).status).toBe(403);
		expect((await new Actor(host.code).start()).status).toBe(403);
		expect(host.room.phase).toBe('lobby');
		const r = await host.start();
		expect(r.status).toBe(200);
		expect(r.body).toEqual({ ok: true });
		expect(host.room.phase).toBe('round_active');
		expect((await host.start()).status).toBe(409);
		expect((await new Actor('ZZZZZZ').start()).status).toBe(404);
	});

	it('start works with only the playing host as player', async () => {
		const host = await newRoom({ hostPlays: true });
		expect((await host.start()).status).toBe(200);
	});

	it('next: only on the leaderboard and only for the host', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		expect((await host.next()).status).toBe(409); // lobby
		await host.start();
		expect((await host.next()).status).toBe(409); // active
		vi.advanceTimersByTime(10_000);
		expect(host.room.phase).toBe('round_reveal');
		expect((await host.next()).status).toBe(409);
		vi.advanceTimersByTime(LIMITS.revealMs);
		expect(host.room.phase).toBe('leaderboard');
		expect((await ann.next()).status).toBe(403);
		expect(host.room.phase).toBe('leaderboard');
		expect((await host.next()).status).toBe(200);
		expect(host.room.phase).toBe('round_active');
		expect(host.room.rounds).toHaveLength(2);
	});

	it('next cancels the auto advance timer (no double advance)', async () => {
		const host = await newRoom({ rounds: 3 });
		await joined(host, 'Ann');
		await host.start();
		vi.advanceTimersByTime(10_000 + LIMITS.revealMs);
		await host.next();
		vi.advanceTimersByTime(LIMITS.leaderboardAutoMs - 100);
		expect(host.room.rounds).toHaveLength(2);
		expect(host.room.phase).toBe('round_active');
	});

	it('the leaderboard auto advances after 8s', async () => {
		const host = await newRoom({ rounds: 2 });
		await joined(host, 'Ann');
		await host.start();
		vi.advanceTimersByTime(10_000 + LIMITS.revealMs);
		expect(host.room.phase).toBe('leaderboard');
		vi.advanceTimersByTime(LIMITS.leaderboardAutoMs - 1);
		expect(host.room.phase).toBe('leaderboard');
		vi.advanceTimersByTime(1);
		expect(host.room.phase).toBe('round_active');
	});

	it('restart: only when finished and only for the host', async () => {
		const host = await newRoom({ rounds: 1 });
		const ann = await joined(host, 'Ann');
		expect((await host.restart()).status).toBe(409);
		await host.start();
		expect((await host.restart()).status).toBe(409);
		vi.advanceTimersByTime(10_000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs);
		expect(host.room.phase).toBe('finished');
		expect((await ann.restart()).status).toBe(403);
		expect((await host.restart()).status).toBe(200);
		expect(host.room.phase).toBe('lobby');
	});
});

describe('kick', () => {
	it('removes a player, closes their stream and rejects them afterwards', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		await joined(host, 'Bob');
		const stream = await openStream(ann);
		const id = ann.me!.id;
		const r = await host.kick(id);
		expect(r.status).toBe(200);
		expect(host.room.players.has(id)).toBe(false);
		await stream.flush();
		expect(stream.isClosed()).toBe(true);
		expect((await ann.guess('x')).status).toBe(401);
		expect((await ann.events() as Response).status).toBe(401);
		expect(stream.events().some((e) => e.event === 'snapshot')).toBe(true);
	});

	it('permissions and errors: 403 non host, 404 unknown player, 400 bad body, host player is protected', async () => {
		const host = await newRoom({ hostPlays: true });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		expect((await ann.kick(bob.me!.id)).status).toBe(403);
		expect((await host.kick('nope')).status).toBe(404);
		expect((await host.kick(undefined)).status).toBe(400);
		expect((await host.kick(42)).status).toBe(400);
		expect((await host.kick(host.me!.id)).status).toBe(400);
		expect(host.room.players.size).toBe(3);
	});

	it('a kicked player can rejoin with a new identity and the same name is free again', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		await host.kick(ann.me!.id);
		expect(ann.me).toBeUndefined();
		const again = new Actor(host.code);
		expect((await again.join('Ann')).status).toBe(201);
	});

	it('kicking the last unfinished player ends the round early', async () => {
		const host = await newRoom({ secondsPerRound: 60 });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		await host.start();
		await ann.guess(answerOf(host.room).name);
		expect(host.room.phase).toBe('round_active');
		await host.kick(bob.me!.id);
		expect(host.room.phase).toBe('round_reveal');
	});

	it('kicking during a round does not break the leaderboard', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		await joined(host, 'Bob');
		await host.start();
		await ann.guess(answerOf(host.room).name);
		await host.kick(ann.me!.id);
		vi.advanceTimersByTime(10_000 + LIMITS.revealMs);
		const snap = (await host.snapshot()).body;
		expect(snap.phase).toBe('leaderboard');
		expect(snap.players.map((p: { name: string }) => p.name)).toEqual(['Bob']);
		// the kicked player's correct entry is shown without a name instead of crashing
		expect(snap.round.correct).toHaveLength(1);
	});
});

describe('a whole game', () => {
	it('runs through all rounds to finished, then restarts with reset scores', async () => {
		const host = await newRoom({ rounds: 3, secondsPerRound: 10, generations: [1, 2] });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		// open event streams so both players count as connected (as in a real browser)
		await openStream(ann);
		await openStream(bob);
		const seen: number[] = [];

		for (let round = 0; round < 3; round++) {
			expect((round === 0 ? await host.start() : await host.next()).status).toBe(200);
			const room = host.room;
			expect(room.phase).toBe('round_active');
			expect(room.rounds).toHaveLength(round + 1);
			const answer = answerOf(room);
			expect(seen).not.toContain(answer.id);
			seen.push(answer.id);
			expect([1, 2]).toContain(answer.generation);
			const snap = (await ann.snapshot()).body;
			expect(snap.round).toMatchObject({ index: round, total: 3 });
			expect(snap.round.endsAt - snap.round.startedAt).toBe(10_000);

			expect((await ann.guess(answer.name, round)).body.status).toBe('correct');
			if (round !== 1) expect((await bob.guess(answer.name.toUpperCase(), round)).body.status).toBe('correct');
			// round 1: bob never answers, the timer ends the round
			if (round === 1) {
				expect(room.phase).toBe('round_active');
				vi.advanceTimersByTime(10_000);
			}
			expect(room.phase).toBe('round_reveal');
			vi.advanceTimersByTime(LIMITS.revealMs);
			expect(room.phase).toBe('leaderboard');
			if (round < 2) continue;
			// last round: next goes to finished
			expect((await host.next()).status).toBe(200);
		}

		const room = host.room;
		expect(room.phase).toBe('finished');
		expect(new Set(seen).size).toBe(3);
		const snap = (await ann.snapshot()).body;
		expect(snap.phase).toBe('finished');
		expect(snap.revealed).not.toBeNull();
		const total = (name: string) => snap.players.find((p: { name: string }) => p.name === name).score;
		expect(total('Ann')).toBeGreaterThanOrEqual(150);
		expect(total('Bob')).toBeGreaterThanOrEqual(100);
		expect(total('Ann')).toBeGreaterThan(total('Bob'));
		expect(snap.players[0].name).toBe('Ann');
		// no actions that make no sense after the end
		expect((await host.next()).status).toBe(409);
		expect((await host.start()).status).toBe(409);
		expect((await ann.guess('x', 2)).body.status).toBe('not_active');
		expect((await new Actor(host.code).join('Late')).status).toBe(409);
		// the old mask is gone with a restart
		const oldMask = room.rounds[2].maskToken;

		expect((await host.restart()).status).toBe(200);
		const after = (await ann.snapshot()).body;
		expect(after.phase).toBe('lobby');
		expect(after.round).toBeNull();
		expect(after.revealed).toBeNull();
		expect(after.players.map((p: { name: string }) => p.name).sort()).toEqual(['Ann', 'Bob']);
		for (const p of after.players) expect(p).toMatchObject({ score: 0, lastDelta: 0 });
		expect((await ann.mask(oldMask)).status).toBe(404);
		expect((await new Actor(host.code).join('Late')).status).toBe(201);

		// settings are editable again and a new game works from scratch
		expect((await host.settings({ rounds: 1 })).status).toBe(200);
		expect((await host.start()).status).toBe(200);
		expect(host.room.rounds).toHaveLength(1);
		expect(host.room.phase).toBe('round_active');
	});

	it('finishes by itself when nobody presses next', async () => {
		const host = await newRoom({ rounds: 2 });
		await joined(host, 'Ann');
		await host.start();
		const total = 2 * (10_000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs);
		vi.advanceTimersByTime(total);
		expect(host.room.phase).toBe('finished');
	});

	it('does not repeat Pokemon within a game and honours the generation filter', async () => {
		const host = await newRoom({ rounds: 12, secondsPerRound: 5, generations: [9] });
		await joined(host, 'Ann');
		await host.start();
		vi.advanceTimersByTime(12 * (5000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs));
		const ids = host.room.rounds.map((r) => answerOf(host.room, r.index));
		expect(new Set(ids.map((p) => p.id)).size).toBe(12);
		for (const p of ids) expect(p.generation).toBe(9);
	});
});
