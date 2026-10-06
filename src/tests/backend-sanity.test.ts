import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRooms, createRoom, getRoom, joinRoom, snapshotFor, validateSettings } from '../lib/server/rooms';
import { checkAllCorrect, endRound, nextRound, startGame } from '../lib/server/game';
import { submitGuess } from '../lib/server/guess';
import { getPokemon, pickPokemon } from '../lib/server/pokemon';
import { generateRoomCode } from '../lib/server/codes';
import { subscribe } from '../lib/server/sse';

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
		expect(submitGuess(room, ann.token, answer.name.toUpperCase(), 0)).toEqual({ status: 'correct', points: 50 });
		expect(submitGuess(room, ann.token, answer.name, 0)).toEqual({ status: 'already_correct' });
		expect(room.phase).toBe('round_active');
		expect(submitGuess(room, bob.value.token, answer.name, 0)).toMatchObject({ status: 'correct' });
		// all connected correct -> early end
		expect(room.phase).toBe('round_reveal');
		expect(ann.score).toBe(50);
		expect(snapshotFor(room).revealed?.pokemon.id).toBe(answer.id);
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
