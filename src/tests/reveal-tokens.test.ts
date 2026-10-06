import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRooms, createRoom, joinRoom, snapshotFor } from '#lib/server/rooms.ts';
import { endRound, nextRound, startGame } from '#lib/server/game.ts';
import { submitGuess } from '#lib/server/guess.ts';
import { getPokemon } from '#lib/server/pokemon.ts';
import { subscribe } from '#lib/server/sse.ts';
import { GET as getSprite } from '../routes/api/rooms/[code]/sprite/[spriteToken]/+server.ts';
import { GET as getMask } from '../routes/api/rooms/[code]/mask/[maskToken]/+server.ts';
import { POST as postGuess } from '../routes/api/rooms/[code]/guess/+server.ts';
import { hostCookieName, playerCookieName } from '#lib/types.ts';
import type { Room } from '#lib/server/types.ts';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});
afterEach(() => {
	__resetRooms();
	vi.useRealTimers();
});

function setup() {
	const r = createRoom({ hostPlays: false, rounds: 3, secondsPerRound: 10 });
	if (!r.ok) throw new Error(r.error);
	const room = r.value;
	const ann = joinRoom(room, 'Ann');
	const bob = joinRoom(room, 'Bob');
	if (!ann.ok || !bob.ok) throw new Error('join');
	startGame(room);
	return { room, ann: ann.value, bob: bob.value };
}

function cookieStore(values: Record<string, string>) {
	return { get: (n: string) => values[n] } as never;
}

async function sprite(room: Room, token: string, cookies: Record<string, string> = {}) {
	return getSprite({ params: { code: room.code, spriteToken: token }, cookies: cookieStore(cookies) } as never);
}

/** Walks a JSON value: no numeric `id` property and no `pokemon` key besides allowed ones. */
function numericIds(v: unknown, out: unknown[] = []): unknown[] {
	if (Array.isArray(v)) v.forEach((x) => numericIds(x, out));
	else if (v && typeof v === 'object') {
		for (const [k, x] of Object.entries(v)) {
			if (k === 'id' && typeof x === 'number') out.push(x);
			if (k === 'pokemonId') out.push(x);
			numericIds(x, out);
		}
	}
	return out;
}

describe('sprite endpoint authorization', () => {
	it('404s before a correct guess, for others, for stale and unknown tokens', async () => {
		const { room, ann, bob } = setup();
		const round = room.rounds[0];
		const answer = getPokemon(round.pokemonId)!;
		expect((await sprite(room, round.spriteToken, { [playerCookieName(room.code)]: ann.token })).status).toBe(404);
		expect((await sprite(room, round.spriteToken)).status).toBe(404);
		expect((await sprite(room, 'nope')).status).toBe(404);

		submitGuess(room, ann.token, answer.name, 0);
		expect((await sprite(room, round.spriteToken, { [playerCookieName(room.code)]: bob.token })).status).toBe(404);
		expect((await sprite(room, round.spriteToken)).status).toBe(404);
		expect((await sprite(room, round.spriteToken, { [playerCookieName(room.code)]: 'forged' })).status).toBe(404);
	});

	it('200 for the correct guesser, with no-store, no redirect and no id in headers', async () => {
		const { room, ann } = setup();
		const round = room.rounds[0];
		const answer = getPokemon(round.pokemonId)!;
		submitGuess(room, ann.token, answer.name, 0);
		const res = await sprite(room, round.spriteToken, { [playerCookieName(room.code)]: ann.token });
		expect(res.status).toBe(200);
		expect(res.headers.get('Cache-Control')).toBe('no-store');
		expect(res.headers.get('Content-Type')).toBe('image/png');
		expect(res.headers.get('Location')).toBeNull();
		const headers = JSON.stringify([...res.headers.entries()]);
		expect(headers).not.toMatch(new RegExp(`(^|\\D)${answer.id}(\\D|$)`));
		expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
	});

	it('host cookie resolves to the host player', async () => {
		const r = createRoom({ hostPlays: true, rounds: 2, secondsPerRound: 10 });
		if (!r.ok) throw new Error(r.error);
		const room = r.value;
		const j = joinRoom(room, 'Ann');
		if (!j.ok) throw new Error(j.error);
		startGame(room);
		const round = room.rounds[0];
		const answer = getPokemon(round.pokemonId)!;
		const host = { [hostCookieName(room.code)]: room.hostToken };
		expect((await sprite(room, round.spriteToken, host)).status).toBe(404);
		expect(submitGuess(room, { hostToken: room.hostToken }, answer.name, 0)).toMatchObject({ status: 'correct' });
		expect((await sprite(room, round.spriteToken, host)).status).toBe(200);
	});

	it('200 for everyone after the round ended, including later phases', async () => {
		const { room, bob } = setup();
		const round = room.rounds[0];
		endRound(room);
		expect(room.phase).toBe('round_reveal');
		expect((await sprite(room, round.spriteToken)).status).toBe(200);
		vi.advanceTimersByTime(4000);
		expect(room.phase).toBe('leaderboard');
		expect((await sprite(room, round.spriteToken, { [playerCookieName(room.code)]: bob.token })).status).toBe(200);
		nextRound(room);
		// old round is over, new round still hidden
		expect((await sprite(room, round.spriteToken)).status).toBe(200);
		expect((await sprite(room, room.rounds[1].spriteToken)).status).toBe(404);
	});
});

describe('tokens', () => {
	it('maskToken differs from spriteToken and a mask URL is not a sprite URL', async () => {
		const { room, ann } = setup();
		const round = room.rounds[0];
		const answer = getPokemon(round.pokemonId)!;
		expect(round.maskToken).not.toBe(round.spriteToken);
		submitGuess(room, ann.token, answer.name, 0);
		endRound(room);
		const cookies = { [playerCookieName(room.code)]: ann.token };
		expect((await sprite(room, round.maskToken, cookies)).status).toBe(404);
		const res = await getMask({ params: { code: room.code, maskToken: round.spriteToken } } as never);
		expect(res.status).toBe(404);
	});
});

describe('no id or early answer in payloads', () => {
	it('keeps the answer out of snapshots, SSE, scoreboard and guess responses until allowed', async () => {
		const { room, ann, bob } = setup();
		const round = room.rounds[0];
		const answer = getPokemon(round.pokemonId)!;
		const quoted = `"${answer.name}"`;
		const bobChunks: string[] = [];
		const annChunks: string[] = [];
		subscribe(room, { playerToken: bob.token }, (c) => bobChunks.push(c), () => {});
		subscribe(room, { playerToken: ann.token }, (c) => annChunks.push(c), () => {});

		const snap = snapshotFor(room, { playerToken: bob.token });
		expect(JSON.stringify(snap)).not.toContain(quoted);
		expect(snap.revealed).toBeNull();

		const wrong = await postGuess({
			params: { code: room.code },
			request: new Request('http://x', { method: 'POST', body: JSON.stringify({ value: 'zzzz', round: 0 }) }),
			cookies: cookieStore({ [playerCookieName(room.code)]: ann.token })
		} as never);
		expect(JSON.stringify(await wrong.json())).not.toContain(quoted);

		const ok = await postGuess({
			params: { code: room.code },
			request: new Request('http://x', { method: 'POST', body: JSON.stringify({ value: answer.name, round: 0 }) }),
			cookies: cookieStore({ [playerCookieName(room.code)]: ann.token })
		} as never);
		const body = await ok.json();
		expect(body).toEqual({
			status: 'correct',
			points: expect.any(Number),
			pokemon: { name: answer.name, generation: answer.generation },
			spriteUrl: `/api/rooms/${room.code}/sprite/${round.spriteToken}`
		});
		expect(numericIds(body)).toEqual([]);

		// Everything Bob received during the active round (SSE events and snapshots) is clean.
		const bobActive = bobChunks.join('');
		expect(bobActive).not.toContain(quoted);
		expect(bobActive).not.toContain(round.spriteToken);
		expect(snapshotFor(room, { playerToken: bob.token }).revealed).toBeNull();
		// Ann's refresh keeps her reveal; the anonymous viewer gets none.
		expect(snapshotFor(room, { playerToken: ann.token }).revealed?.pokemon.name).toBe(answer.name);
		expect(snapshotFor(room).revealed).toBeNull();
		const publicAnnSse = annChunks.join('');
		expect(publicAnnSse).not.toMatch(/event: round_ended/);

		endRound(room);
		const after = bobChunks.join('');
		expect(after).toContain('event: round_ended');
		expect(after).toContain(quoted);
		vi.advanceTimersByTime(4000);

		const ids = numericIds([
			...[...bobChunks, ...annChunks].map((c) => {
				const line = c.split('\n').find((l) => l.startsWith('data: '));
				return line ? JSON.parse(line.slice(6)) : null;
			}),
			snapshotFor(room, { playerToken: bob.token })
		]);
		expect(ids).toEqual([]);
		expect(room.phase).toBe('leaderboard');
	});
});
