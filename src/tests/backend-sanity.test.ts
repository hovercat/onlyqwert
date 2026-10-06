import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRooms, createRoom, getRoom, joinRoom, snapshotFor, validateSettings } from '#lib/server/rooms.ts';
import { checkAllCorrect, endRound, nextRound, startGame } from '#lib/server/game.ts';
import { submitGuess } from '#lib/server/guess.ts';
import { getPokemon, pickPokemon } from '#lib/server/pokemon.ts';
import { generateRoomCode } from '#lib/server/codes.ts';
import { subscribe } from '#lib/server/sse.ts';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});
afterEach(() => {
	__resetRooms();
	vi.useRealTimers();
});

function setup(settings: object = { hostPlays: false, rounds: 2, secondsPerRound: 10 }) {
	const r = createRoom(settings);
	if (!r.ok) throw new Error(r.error);
	const room = r.value;
	const a = joinRoom(room, 'Ann');
	if (!a.ok) throw new Error(a.error);
	return { room, ann: a.value };
}

describe('backend sanity', () => {
	it('validates settings and codes', () => {
		expect(typeof validateSettings({ rounds: 0 })).toBe('string');
		expect(typeof validateSettings({ generations: [] })).toBe('string');
		expect(validateSettings({ generations: [2, 1, 1] })).toMatchObject({ generations: [1, 2] });
		expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
	});

	it('plays a round with scoring and no leaks', () => {
		const { room, ann } = setup();
		const bob = joinRoom(room, 'Bob');
		if (!bob.ok) throw new Error(bob.error);
		expect(startGame(room).ok).toBe(true);
		const snap = JSON.stringify(snapshotFor(room, { playerToken: ann.token }));
		const answer = getPokemon(room.rounds[0].pokemonId)!;
		expect(snap).not.toContain(ann.token);
		expect(snap).not.toContain(room.hostToken);
		expect(snap).not.toContain(answer.name);
		expect(snapshotFor(room).revealed).toBeNull();

		vi.advanceTimersByTime(5000);
		expect(submitGuess(room, ann.token, 'nope', 0)).toEqual({ status: 'wrong' });
		expect(submitGuess(room, ann.token, answer.name, 1)).toEqual({ status: 'not_active' });
		expect(submitGuess(room, ann.token, answer.name.toUpperCase(), 0)).toMatchObject({ status: 'correct', points: 75 });
		expect(submitGuess(room, ann.token, answer.name, 0)).toEqual({ status: 'already_correct' });
		expect(room.phase).toBe('round_active');
		expect(submitGuess(room, bob.value.token, answer.name, 0)).toMatchObject({ status: 'correct' });
		// all connected correct -> early end
		expect(room.phase).toBe('round_reveal');
		expect(ann.score).toBe(75);
		expect(snapshotFor(room).revealed?.pokemon.name).toBe(answer.name);
		vi.advanceTimersByTime(4000);
		expect(room.phase).toBe('leaderboard');
		vi.advanceTimersByTime(8000);
		expect(room.phase).toBe('round_active');
		expect(room.rounds[1].pokemonId).not.toBe(answer.id);
	});

	it('ends on timer, finishes after last round, throttles', () => {
		const { room, ann } = setup({ hostPlays: false, rounds: 1, secondsPerRound: 5 });
		startGame(room);
		for (let i = 0; i < 20; i++) submitGuess(room, ann.token, 'x', 0);
		expect(submitGuess(room, ann.token, 'x', 0)).toEqual({ status: 'throttled' });
		vi.advanceTimersByTime(5000);
		expect(room.phase).toBe('round_reveal');
		vi.advanceTimersByTime(4000);
		expect(nextRound(room).ok).toBe(true);
		expect(room.phase).toBe('finished');
		expect(submitGuess(room, 'bad', 'x', 0)).toEqual({ status: 'unauthorized' });
	});

	it('picks without repeats and sends snapshot first over SSE', () => {
		const used = new Set<number>();
		const ids = new Set<number>();
		for (let i = 0; i < 151; i++) {
			const p = pickPokemon([1], used)!;
			used.add(p.id);
			ids.add(p.id);
		}
		expect(ids.size).toBe(151);
		const { room, ann } = setup();
		const chunks: string[] = [];
		subscribe(room, { playerToken: ann.token }, (c) => chunks.push(c), () => {});
		expect(chunks[0].startsWith('event: snapshot')).toBe(true);
		expect(getRoom(room.code.toLowerCase())).toBe(room);
		void endRound;
		void checkAllCorrect;
	});
});

describe('teardown', () => {
	it('does not schedule grace timers after the room is deleted', async () => {
		const { deleteRoom } = await import('#lib/server/rooms.ts');
		const r = createRoom({ hostPlays: false, rounds: 2, secondsPerRound: 10 });
		if (!r.ok) throw new Error(r.error);
		const j = joinRoom(r.value, 'Ash');
		if (!j.ok) throw new Error(j.error);
		const unsub = subscribe(r.value, { playerToken: j.value.token }, () => {}, () => {});
		startGame(r.value);
		deleteRoom(r.value);
		const before = vi.getTimerCount(); // only the idle sweeper
		unsub();
		expect(vi.getTimerCount()).toBe(before);
	});
});

describe('scoring floor via submitGuess', () => {
	it('awards 50 at endsAt - 1 and nothing at endsAt', () => {
		const { room, ann } = setup();
		const bob = joinRoom(room, 'Bob');
		if (!bob.ok) throw new Error(bob.error);
		expect(startGame(room).ok).toBe(true);
		const round = room.rounds[0];
		const name = getPokemon(round.pokemonId)!.name;
		expect(submitGuess(room, ann.token, name, 0, round.endsAt - 1)).toMatchObject({ status: 'correct', points: 50 });
		expect(submitGuess(room, bob.value.token, name, 0, round.endsAt)).toEqual({ status: 'not_active' });
		expect(bob.value.score).toBe(0);
	});
});
