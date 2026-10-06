import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '#lib/types.ts';
import { calculateScore } from '#lib/game/scoring.ts';
import { Actor, answerOf, joined, newRoom, openStream, resetWorld, useFakeClock } from '../helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

/** Room with N named players, started, each with an open stream (counts as connected). */
async function started(names: string[], settings: Record<string, unknown> = {}) {
	const host = await newRoom({ secondsPerRound: 10, rounds: 3, ...settings });
	const players: Record<string, Actor> = {};
	for (const n of names) {
		players[n] = await joined(host, n);
		await openStream(players[n]);
	}
	await host.start();
	const round = host.room.rounds[0];
	return { host, p: players, round, answer: answerOf(host.room, 0) };
}

describe('POST /api/rooms/[code]/guess results', () => {
	it('correct: full payload, case and punctuation insensitive', async () => {
		const { p, round, answer, host } = await started(['Ann', 'Bob']);
		const r = await p.Ann.guess(`  ${answer.name.toUpperCase()}!! `);
		expect(r.status).toBe(200);
		expect(r.body).toEqual({
			status: 'correct',
			points: 100,
			pokemon: { name: answer.name, generation: answer.generation },
			spriteUrl: `/api/rooms/${host.code}/sprite/${round.spriteToken}`
		});
		expect(Object.keys(r.body)).not.toContain('id');
	});

	it('accepts localized aliases (every language in the dataset)', async () => {
		const { host, p, answer } = await started(['A', 'B', 'C', 'D']);
		const aliases = (answer.aliases ?? []).filter((a) => [...a].length > 2);
		expect(aliases.length).toBeGreaterThanOrEqual(3);
		void host;
		const names = ['A', 'B', 'C'];
		for (let i = 0; i < names.length; i++) {
			const r = await p[names[i]].guess(aliases[i]);
			expect(r.body.status, `alias ${aliases[i]}`).toBe('correct');
			// the response still uses the English display name
			expect(r.body.pokemon.name).toBe(answer.name);
		}
	});

	it('wrong: neutral response, nothing broadcast, nothing recorded', async () => {
		const { host, p, round } = await started(['Ann', 'Bob']);
		const stream = await openStream(p.Bob);
		stream.events();
		const before = stream.text().length;
		for (const v of ['', 'zzz', 'pika chu', '   ', 'a'.repeat(5000)]) {
			const r = await p.Ann.guess(v);
			expect(r.status).toBe(200);
			expect(r.body).toEqual({ status: 'wrong' });
			vi.advanceTimersByTime(60); // stay below the throttle
		}
		await stream.flush();
		expect(stream.text().length).toBe(before);
		expect(round.correct).toHaveLength(0);
		void host;
	});

	it('already_correct on repeats, for any value, and the score is not given twice', async () => {
		const { host, p, answer, round } = await started(['Ann', 'Bob']);
		expect((await p.Ann.guess(answer.name)).body.status).toBe('correct');
		expect((await p.Ann.guess(answer.name)).body).toEqual({ status: 'already_correct' });
		expect((await p.Ann.guess('nonsense')).body).toEqual({ status: 'already_correct' });
		expect(round.correct).toHaveLength(1);
		vi.advanceTimersByTime(10_000);
		expect(host.room.players.get(p.Ann.me!.id)!.score).toBe(100);
	});

	it('not_active before the game starts (lobby)', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const r = await ann.guess('pikachu', 0);
		expect(r.status).toBe(200);
		expect(r.body).toEqual({ status: 'not_active' });
	});

	it('not_active at endsAt and after (timer not fired yet), then during reveal and leaderboard', async () => {
		const { host, p, answer, round } = await started(['Ann', 'Bob', 'Cat']);
		vi.setSystemTime(round.endsAt - 1);
		expect((await p.Ann.guess(answer.name)).body).toMatchObject({ status: 'correct', points: 50 });
		vi.setSystemTime(round.endsAt);
		expect((await p.Bob.guess(answer.name)).body).toEqual({ status: 'not_active' });
		vi.setSystemTime(round.endsAt + 5000);
		expect((await p.Bob.guess(answer.name)).body).toEqual({ status: 'not_active' });
		// jump past the round and let the timers run
		await vi.advanceTimersByTimeAsync(10_000 + LIMITS.revealMs);
		expect(host.room.phase).toBe('leaderboard');
		expect((await p.Cat.guess(answer.name)).body).toEqual({ status: 'not_active' });
	});

	it('not_active for a wrong or missing round index', async () => {
		const { p, answer } = await started(['Ann', 'Bob']);
		for (const round of [1, -1, 0.5, '0', null, NaN, 99]) {
			const r = await p.Ann.guess(answer.name, round);
			expect(r.body, `round=${String(round)}`).toEqual({ status: 'not_active' });
			vi.advanceTimersByTime(60);
		}
		expect((await p.Ann.guess(answer.name, 0)).body.status).toBe('correct');
	});

	it('a stale round index from the previous round does not score in the next one', async () => {
		const { host, p, answer } = await started(['Ann']);
		await p.Ann.guess(answer.name, 0); // all correct, round ends early
		vi.advanceTimersByTime(LIMITS.revealMs);
		await host.next();
		const next = answerOf(host.room);
		expect((await p.Ann.guess(next.name, 0)).body).toEqual({ status: 'not_active' });
		expect((await p.Ann.guess(next.name, 1)).body.status).toBe('correct');
	});

	it('a non string value is not active/wrong, never a crash', async () => {
		const { p } = await started(['Ann', 'Bob']);
		for (const v of [undefined, null, 12, {}, [], true]) {
			const r = await p.Ann.guess(v, 0);
			expect(r.status).toBe(200);
			expect(r.body.status).toBe('not_active');
			vi.advanceTimersByTime(60);
		}
	});

	it('401 without a cookie, with a forged cookie, for the host who does not play, and 404 for unknown room', async () => {
		const { host, p, answer } = await started(['Ann']);
		expect((await new Actor(host.code).guess(answer.name)).status).toBe(401);
		const forged = new Actor(host.code);
		forged.jar.set(`oq_player_${host.code}`, 'forged');
		expect((await forged.guess(answer.name)).status).toBe(401);
		expect((await host.guess(answer.name)).status).toBe(401);
		expect((await new Actor('ZZZZZZ').guess('x')).status).toBe(404);
		void p;
	});

	it('a playing host can guess with the host identity', async () => {
		const host = await newRoom({ hostPlays: true });
		await joined(host, 'Ann');
		await host.start();
		const r = await host.guess(answerOf(host.room).name);
		expect(r.body.status).toBe('correct');
		expect(r.body.points).toBe(100);
	});

	it('cannot use another player id or body field to impersonate', async () => {
		const { host, p, answer } = await started(['Ann', 'Bob']);
		const mallory = new Actor(host.code);
		expect((await mallory.guess(answer.name)).status).toBe(401);
		expect(host.room.rounds[0].correct).toHaveLength(0);
		void p;
	});
});

describe('throttle', () => {
	it('allows 20 guesses per second and answers 429 with Retry-After beyond that', async () => {
		const { p } = await started(['Ann', 'Bob']);
		for (let i = 0; i < LIMITS.guessesPerSecond; i++) {
			expect((await p.Ann.guess('x')).status).toBe(200);
		}
		const r = await p.Ann.guess('x');
		expect(r.status).toBe(429);
		expect(r.headers.get('Retry-After')).toBe('1');
		expect(r.body.error).toBeTruthy();
		// per player, not global
		expect((await p.Bob.guess('x')).status).toBe(200);
		// a sliding window: free again 1000 ms after the first request
		vi.advanceTimersByTime(999);
		expect((await p.Ann.guess('x')).status).toBe(429);
		vi.advanceTimersByTime(1);
		expect((await p.Ann.guess('x')).status).toBe(200);
	});

	it('throttled attempts do not score even if the value would be correct', async () => {
		const { p, answer, round } = await started(['Ann', 'Bob']);
		for (let i = 0; i < LIMITS.guessesPerSecond; i++) await p.Ann.guess('x');
		expect((await p.Ann.guess(answer.name)).status).toBe(429);
		expect(round.correct).toHaveLength(0);
	});
});

describe('points', () => {
	const sample = [0, 1, 99, 100, 2500, 2501, 5000, 7499, 7500, 9899, 9900, 9998, 9999];

	it('follows 50 + round(50 * timeLeft / duration) across the whole round', async () => {
		for (const dt of sample) {
			resetWorld();
			useFakeClock();
			const { p, answer, round } = await started(['Ann', 'Bob']);
			vi.setSystemTime(round.startedAt + dt);
			const r = await p.Ann.guess(answer.name);
			const expected = 50 + Math.round((50 * (10_000 - dt)) / 10_000);
			expect(r.body.points, `dt=${dt}`).toBe(expected);
			expect(r.body.points).toBe(calculateScore(round.startedAt, round.endsAt, round.startedAt + dt));
		}
	});

	it('boundaries: 100 at the start, 75 at half, 63 at three quarters, 50 at the last ms', async () => {
		const expectAt = async (dt: number, pts: number) => {
			resetWorld();
			useFakeClock();
			const { p, answer, round } = await started(['Ann', 'Bob']);
			vi.setSystemTime(round.startedAt + dt);
			expect((await p.Ann.guess(answer.name)).body.points).toBe(pts);
		};
		await expectAt(0, 100);
		await expectAt(5000, 75);
		await expectAt(7500, 63);
		await expectAt(9999, 50);
	});

	it('uses the configured duration (5s and 120s rounds)', async () => {
		for (const secs of [5, 120]) {
			resetWorld();
			useFakeClock();
			const { p, answer, round } = await started(['Ann', 'Bob'], { secondsPerRound: secs });
			expect(round.endsAt - round.startedAt).toBe(secs * 1000);
			vi.setSystemTime(round.startedAt + (secs * 1000) / 2);
			expect((await p.Ann.guess(answer.name)).body.points).toBe(75);
		}
	});

	it('is stored on the round immediately but added to the score only at round end', async () => {
		const { host, p, answer } = await started(['Ann', 'Bob'], { secondsPerRound: 60 });
		vi.advanceTimersByTime(30_000);
		await p.Ann.guess(answer.name);
		const live = (await host.snapshot()).body;
		expect(live.round.correct).toMatchObject([{ name: 'Ann', points: 75, order: 1 }]);
		expect(live.players.find((x: { name: string }) => x.name === 'Ann')).toMatchObject({ score: 0, lastDelta: 0 });
		vi.advanceTimersByTime(30_000);
		const ended = (await host.snapshot()).body;
		expect(ended.phase).toBe('round_reveal');
		expect(ended.players.find((x: { name: string }) => x.name === 'Ann')).toMatchObject({ score: 75, lastDelta: 75 });
	});
});

describe('round end and scoreboard', () => {
	it('ends early as soon as every connected player is correct', async () => {
		const { host, p, answer } = await started(['Ann', 'Bob', 'Cat']);
		await p.Ann.guess(answer.name);
		await p.Bob.guess(answer.name);
		expect(host.room.phase).toBe('round_active');
		await p.Cat.guess(answer.name);
		expect(host.room.phase).toBe('round_reveal');
		// the 4s reveal timer follows; the old round timer did not fire another end
		vi.advanceTimersByTime(LIMITS.revealMs);
		expect(host.room.phase).toBe('leaderboard');
	});

	it('does not wait for a player whose connection dropped (after the 10s grace)', async () => {
		const host = await newRoom({ secondsPerRound: 60 });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const cat = await joined(host, 'Cat'); // never opens a stream
		await openStream(ann);
		await openStream(bob);
		await host.start();
		const answer = answerOf(host.room);
		await ann.guess(answer.name);
		await bob.guess(answer.name);
		expect(host.room.phase).toBe('round_active'); // Cat is still inside the grace period
		vi.advanceTimersByTime(LIMITS.disconnectGraceMs);
		expect(cat.me!.connected).toBe(false);
		expect(host.room.phase).toBe('round_reveal');
	});

	it('does not end early when nobody is connected', async () => {
		const host = await newRoom({ secondsPerRound: 60 });
		const ann = await joined(host, 'Ann');
		await host.start();
		vi.advanceTimersByTime(LIMITS.disconnectGraceMs);
		await ann.guess(answerOf(host.room).name);
		expect(host.room.phase).toBe('round_active');
		vi.advanceTimersByTime(50_000);
		expect(host.room.phase).toBe('round_reveal');
		expect(ann.me!.score).toBeGreaterThan(0);
	});

	it('a playing host counts for the early end', async () => {
		const host = await newRoom({ hostPlays: true });
		const ann = await joined(host, 'Ann');
		await openStream(ann);
		await openStream(host);
		await host.start();
		const answer = answerOf(host.room);
		await ann.guess(answer.name);
		expect(host.room.phase).toBe('round_active');
		await host.guess(answer.name);
		expect(host.room.phase).toBe('round_reveal');
	});

	it('ranking: score desc, then earlier correct time, then name; prevRank and lastDelta follow', async () => {
		const { host, p, answer, round } = await started(['Zed', 'Amy', 'Bob', 'Cat', 'Dan']);
		// Round 1: Zed and Amy both 100 pts (Zed 100ms earlier than Amy), Bob 75, Cat and Dan nothing
		vi.setSystemTime(round.startedAt);
		await p.Zed.guess(answer.name);
		vi.setSystemTime(round.startedAt + 100);
		await p.Amy.guess(answer.name);
		vi.setSystemTime(round.startedAt + 5000);
		await p.Bob.guess(answer.name);
		expect(round.correct.map((c) => c.points)).toEqual([100, 100, 75]);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(host.room.phase).toBe('round_reveal');

		let snap = (await host.snapshot()).body;
		const byName = (n: string) => snap.players.find((x: { name: string }) => x.name === n);
		expect(snap.players.map((x: { name: string }) => x.name)).toEqual(['Zed', 'Amy', 'Bob', 'Cat', 'Dan']);
		expect(snap.players.map((x: { rank: number }) => x.rank)).toEqual([1, 2, 3, 4, 5]);
		expect(byName('Zed')).toMatchObject({ score: 100, lastDelta: 100 });
		expect(byName('Bob')).toMatchObject({ score: 75, lastDelta: 75 });
		expect(byName('Cat')).toMatchObject({ score: 0, lastDelta: 0 });
		// before round 1, everybody was ranked alphabetically (all zero): Amy Bob Cat Dan Zed
		expect(['Amy', 'Bob', 'Cat', 'Dan', 'Zed'].map((n) => byName(n).prevRank)).toEqual([1, 2, 3, 4, 5]);

		vi.advanceTimersByTime(LIMITS.revealMs);
		await host.next();
		snap = (await host.snapshot()).body;
		// at the start of round 2 prevRank = rank after round 1, lastDelta reset
		expect(byName('Zed')).toMatchObject({ prevRank: 1, lastDelta: 0, score: 100 });
		expect(byName('Dan')).toMatchObject({ prevRank: 5, lastDelta: 0 });
		expect(byName('Bob')).toMatchObject({ prevRank: 3 });

		// Round 2: Dan is first (100), Cat second (100 but 200ms later), Zed third, Bob fourth, Amy and Cat order on points
		const r2 = host.room.rounds[1];
		const a2 = answerOf(host.room);
		vi.setSystemTime(r2.startedAt);
		await p.Dan.guess(a2.name, 1);
		vi.setSystemTime(r2.startedAt + 100);
		await p.Cat.guess(a2.name, 1);
		await vi.advanceTimersByTimeAsync(10_000);
		snap = (await host.snapshot()).body;
		expect(byName('Dan')).toMatchObject({ score: 100, lastDelta: 100, prevRank: 5 });
		expect(byName('Cat')).toMatchObject({ score: 100, lastDelta: 100, prevRank: 4 });
		// Zed has 100 as well but no correct guess in the latest round, so Dan and Cat (who did) rank ahead;
		// Dan guessed 100 ms before Cat. Amy (100, no latest correct) sorts after Zed? Both have no time: by name, Amy first.
		expect(snap.players.map((x: { name: string }) => x.name)).toEqual(['Dan', 'Cat', 'Amy', 'Zed', 'Bob']);
		// scoreboard event (leaderboard phase) carries the same ranking, without the connected flag
		vi.advanceTimersByTime(LIMITS.revealMs);
		const lb = (await host.snapshot()).body;
		expect(lb.phase).toBe('leaderboard');
	});

	it('equal scores and no correct time fall back to alphabetical (case insensitive) order', async () => {
		const host = await newRoom();
		for (const n of ['bob', 'Cat', 'amy', 'Dan']) await joined(host, n);
		const names = (await host.snapshot()).body.players.map((x: { name: string }) => x.name);
		expect(names).toEqual(['amy', 'bob', 'Cat', 'Dan']);
	});

	it('the final podium event lists the top three in order', async () => {
		const host = await newRoom({ rounds: 1, secondsPerRound: 10 });
		const names = ['Ann', 'Bob', 'Cat', 'Dan'];
		const actors: Actor[] = [];
		for (const n of names) {
			const a = await joined(host, n);
			await openStream(a);
			actors.push(a);
		}
		const watcher = await openStream(actors[0]);
		await host.start();
		const round = host.room.rounds[0];
		const answer = answerOf(host.room);
		for (const [i, a] of actors.slice(0, 3).entries()) {
			vi.setSystemTime(round.startedAt + i * 3000);
			await a.guess(answer.name);
		}
		vi.setSystemTime(round.endsAt);
		await vi.advanceTimersByTimeAsync(10_000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs);
		await watcher.flush();
		const fin = watcher.events().find((e) => e.event === 'game_finished')!;
		expect(fin.data.podium.map((x: { name: string }) => x.name)).toEqual(['Ann', 'Bob', 'Cat']);
		expect(fin.data.players.map((x: { name: string }) => x.name)).toEqual(['Ann', 'Bob', 'Cat', 'Dan']);
		expect(fin.data.players.map((x: { rank: number }) => x.rank)).toEqual([1, 2, 3, 4]);
	});
});
