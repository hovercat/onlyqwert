import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, LIMITS, ROOM_CODE_ALPHABET, hostCookieName, playerCookieName } from '#lib/types.ts';
import { getRoom, roomCount } from '#lib/server/rooms.ts';
import { startGame } from '#lib/server/game.ts';
import { Actor, call, joined, newRoom, resetWorld, useFakeClock } from '../helpers.ts';
import { POST as createH } from '../../routes/api/rooms/+server.ts';
import { POST as joinH } from '../../routes/api/rooms/[code]/join/+server.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

describe('POST /api/rooms', () => {
	it('creates a room with default settings and sets host and player cookies', async () => {
		const host = new Actor();
		const r = await host.create({});
		expect(r.status).toBe(201);
		expect(r.body.code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
		expect(Object.keys(r.body)).toEqual(['code']);
		const room = getRoom(r.body.code)!;
		expect(room.settings).toEqual(DEFAULT_SETTINGS);
		expect(room.phase).toBe('lobby');
		expect(room.hostName).toBe('Host');
		// hostPlays defaults to true, so the host is also a player
		expect([...room.players.values()].map((p) => p.name)).toEqual(['Host']);
		expect(host.jar.get(hostCookieName(room.code))).toBe(room.hostToken);
		expect(host.jar.get(playerCookieName(room.code))).toBe(host.me!.token);
	});

	it('sets httpOnly, SameSite=Lax, path / cookies with a max age', async () => {
		const host = new Actor();
		await host.create({});
		for (const name of [hostCookieName(host.code), playerCookieName(host.code)]) {
			expect(host.jar.opts(name)).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
			expect(host.jar.opts(name)!.maxAge).toBeGreaterThan(0);
		}
	});

	it('does not set a player cookie when the host does not play', async () => {
		const host = await newRoom();
		expect(host.hasHostCookie).toBe(true);
		expect(host.playerToken).toBeUndefined();
		expect(host.room.players.size).toBe(0);
	});

	it('applies custom settings, deduping and sorting generations', async () => {
		const host = new Actor();
		const r = await host.create({
			settings: { generations: [3, 1, 3, 9], rounds: 7, secondsPerRound: 45, hostPlays: false }
		});
		expect(r.status).toBe(201);
		expect(host.room.settings).toEqual({ generations: [1, 3, 9], rounds: 7, secondsPerRound: 45, hostPlays: false });
	});

	it('accepts the boundary values', async () => {
		for (const settings of [
			{ rounds: 1, secondsPerRound: 5 },
			{ rounds: 50, secondsPerRound: 120, generations: [1, 2, 3, 4, 5, 6, 7, 8, 9] }
		]) {
			expect((await new Actor().create({ settings })).status).toBe(201);
		}
	});

	it.each([
		['generations empty', { generations: [] }],
		['generation 0', { generations: [0] }],
		['generation 10', { generations: [1, 10] }],
		['generation fractional', { generations: [1.5] }],
		['generation string', { generations: ['1'] }],
		['generations not an array', { generations: 1 }],
		['rounds 0', { rounds: 0 }],
		['rounds 51', { rounds: 51 }],
		['rounds fractional', { rounds: 2.5 }],
		['rounds string', { rounds: '5' }],
		['rounds null', { rounds: null }],
		['seconds 4', { secondsPerRound: 4 }],
		['seconds 121', { secondsPerRound: 121 }],
		['seconds NaN like', { secondsPerRound: 'abc' }],
		['hostPlays string', { hostPlays: 'yes' }],
		['hostPlays number', { hostPlays: 1 }]
	])('rejects invalid settings: %s', async (_label, settings) => {
		const before = roomCount();
		const r = await new Actor().create({ settings });
		expect(r.status).toBe(400);
		expect(typeof r.body.error).toBe('string');
		expect(roomCount()).toBe(before);
	});

	it.each([['a string', 'x'], ['an array', [1]], ['a number', 3]])('rejects settings that are %s', async (_l, settings) => {
		expect((await new Actor().create({ settings })).status).toBe(400);
	});

	it('does not set cookies when validation fails', async () => {
		const a = new Actor();
		await a.create({ settings: { rounds: 0 } });
		expect(a.jar.names()).toEqual([]);
	});

	it('treats an empty, malformed or non object body as defaults', async () => {
		for (const raw of ['', '{not json', '[1,2]', 'null']) {
			const r = await call(createH, { raw });
			expect(r.status).toBe(201);
		}
	});

	it('generates distinct codes', async () => {
		const codes = new Set<string>();
		for (let i = 0; i < 50; i++) codes.add((await new Actor().create({})).body.code);
		expect(codes.size).toBe(50);
	});

	it('rejects invalid hostName with 400 and uses a valid one', async () => {
		for (const hostName of ['', '   ', 'x'.repeat(21), 42, {}]) {
			expect((await new Actor().create({ hostName })).status).toBe(400);
		}
		const a = new Actor();
		await a.create({ hostName: '  Stream   Er ' });
		expect(a.room.hostName).toBe('Stream Er');
		expect(a.me!.name).toBe('Stream Er');
	});

	it('answers 503 once the room limit is reached', async () => {
		for (let i = 0; i < LIMITS.maxRooms; i++) {
			expect((await call(createH, { body: { settings: { hostPlays: false } } })).status).toBe(201);
		}
		const r = await new Actor().create({});
		expect(r.status).toBe(503);
		expect(roomCount()).toBe(LIMITS.maxRooms);
	});
});

describe('GET /api/rooms/[code]', () => {
	it('returns a no-store snapshot, 404 for unknown rooms, and is case insensitive', async () => {
		const host = await newRoom();
		const r = await host.snapshot();
		expect(r.status).toBe(200);
		expect(r.headers.get('Cache-Control')).toBe('no-store');
		expect(r.body).toMatchObject({ code: host.code, phase: 'lobby', round: null, revealed: null });
		expect(r.body.you).toEqual({ playerId: undefined, isHost: true });
		expect((await host.snapshot(host.code.toLowerCase())).status).toBe(200);
		expect((await host.snapshot('ZZZZZZ')).status).toBe(404);
		expect((await new Actor().snapshot(host.code)).body.you.isHost).toBe(false);
	});
});

describe('POST /api/rooms/[code]/join', () => {
	it('joins, sets a player cookie and shows up in the snapshot', async () => {
		const host = await newRoom();
		const ann = new Actor(host.code);
		const r = await ann.join('Ann');
		expect(r.status).toBe(201);
		expect(r.body).toEqual({ playerId: ann.me!.id });
		expect(ann.jar.opts(playerCookieName(host.code))).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
		const snap = (await ann.snapshot()).body;
		expect(snap.players.map((p: { name: string }) => p.name)).toEqual(['Ann']);
		expect(snap.you).toEqual({ playerId: ann.me!.id, isHost: false });
		expect(snap.players[0]).toMatchObject({ score: 0, lastDelta: 0, connected: true });
	});

	it('returns 404 for an unknown room and accepts a lowercase code', async () => {
		const host = await newRoom();
		expect((await new Actor().join('Ann', 'ZZZZZZ')).status).toBe(404);
		const a = new Actor();
		expect((await a.join('Ann', host.code.toLowerCase())).status).toBe(201);
		expect(host.room.players.size).toBe(1);
	});

	it('trims names and collapses whitespace', async () => {
		const host = await newRoom();
		const a = await joined(host, '  Ash   Ketchum  ');
		expect(a.me!.name).toBe('Ash Ketchum');
	});

	it('rejects duplicate names case insensitively with 409, including the host name', async () => {
		const host = await newRoom({ hostPlays: true }, { hostName: 'Streamy' });
		await joined(host, 'Ann');
		for (const n of ['Ann', 'ann', ' ANN ', 'streamy']) {
			const r = await new Actor(host.code).join(n);
			expect(r.status).toBe(409);
		}
		expect(host.room.players.size).toBe(2);
	});

	it.each([['empty', ''], ['spaces', '    '], ['too long', 'x'.repeat(21)], ['number', 5], ['null', null], ['object', {}], ['control chars only', '\u0000\u0007\n']])(
		'rejects an invalid name with 400: %s',
		async (_l, name) => {
			const host = await newRoom();
			const a = new Actor(host.code);
			expect((await a.join(name)).status).toBe(400);
			expect(a.jar.names()).toEqual([]);
			expect(host.room.players.size).toBe(0);
		}
	);

	it('accepts 20 character names and counts emoji as one character each', async () => {
		const host = await newRoom();
		expect((await new Actor(host.code).join('y'.repeat(20))).status).toBe(201);
		expect((await new Actor(host.code).join('\u{1F600}'.repeat(20))).status).toBe(201);
		expect((await new Actor(host.code).join('\u{1F600}'.repeat(21))).status).toBe(400);
	});

	it('does not allow script markup to alter other fields (stored verbatim, escaped by rendering)', async () => {
		const host = await newRoom();
		const a = await joined(host, '<b>x</b>');
		expect(a.me!.name).toBe('<b>x</b>');
	});

	it('rejects joins when the room is full', async () => {
		const host = await newRoom();
		for (let i = 0; i < LIMITS.maxPlayersPerRoom; i++) {
			expect((await new Actor(host.code).join(`p${i}`)).status).toBe(201);
		}
		const r = await new Actor(host.code).join('one too many');
		expect(r.status).toBe(409);
		expect(host.room.players.size).toBe(LIMITS.maxPlayersPerRoom);
	});

	it('counts a playing host towards the player cap', async () => {
		const host = await newRoom({ hostPlays: true });
		for (let i = 0; i < LIMITS.maxPlayersPerRoom - 1; i++) await new Actor(host.code).join(`p${i}`);
		expect((await new Actor(host.code).join('late')).status).toBe(409);
	});

	it('rejects joins once the game is finished', async () => {
		const host = await newRoom({ rounds: 1 });
		await joined(host, 'Ann');
		startGame(host.room);
		host.room.phase = 'finished';
		const r = await new Actor(host.code).join('Late');
		expect(r.status).toBe(409);
	});

	it('allows joining a running game (round_active)', async () => {
		const host = await newRoom();
		await joined(host, 'Ann');
		startGame(host.room);
		const late = await new Actor(host.code).join('Late');
		expect(late.status).toBe(201);
	});

	it('is idempotent for a browser that already holds a player cookie', async () => {
		const host = await newRoom();
		const ann = new Actor(host.code);
		const first = await ann.join('Ann');
		const again = await ann.join('Ann');
		const other = await ann.join('Totally Different');
		expect(again.status).toBe(201);
		expect(again.body.playerId).toBe(first.body.playerId);
		expect(other.body.playerId).toBe(first.body.playerId);
		expect(host.room.players.size).toBe(1);
		expect(ann.me!.name).toBe('Ann');
	});

	it('a stale or forged player cookie does not count as identity', async () => {
		const host = await newRoom();
		const a = new Actor(host.code);
		a.jar.set(playerCookieName(host.code), 'forged');
		const r = await a.join('Ann');
		expect(r.status).toBe(201);
		expect(a.playerToken).not.toBe('forged');
	});

	it('the host cookie alone does not make a join idempotent', async () => {
		const host = await newRoom({ hostPlays: false });
		const r = await host.join('Streamer');
		expect(r.status).toBe(201);
		expect(host.room.players.size).toBe(1);
	});

	it('survives a malformed body', async () => {
		const host = await newRoom();
		const r = await call(joinH, { params: { code: host.code }, raw: 'nope' });
		expect(r.status).toBe(400);
	});
});
