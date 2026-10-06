import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostCookieName, playerCookieName } from '#lib/types.ts';
import { __resetRooms, getRoom, joinRoom } from '#lib/server/rooms.ts';
import { startGame } from '#lib/server/game.ts';
import { subscribe } from '#lib/server/sse.ts';
import { POST as createRoute } from '../routes/api/rooms/+server.ts';
import { PATCH as meRoute } from '../routes/api/rooms/[code]/me/+server.ts';
import { PATCH as settingsRoute } from '../routes/api/rooms/[code]/settings/+server.ts';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});
afterEach(() => {
	__resetRooms();
	vi.useRealTimers();
});

type Jar = Map<string, string>;
const jar = (init: Record<string, string> = {}): Jar => new Map(Object.entries(init));
const cookiesOf = (j: Jar) => ({
	get: (n: string) => j.get(n),
	set: (n: string, v: string) => void j.set(n, v)
});
const req = (method: string, body?: unknown) =>
	new Request('http://x/api', { method, body: body === undefined ? undefined : JSON.stringify(body) });

async function create(body: object = {}) {
	const j = jar();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const res = await createRoute({ request: req('POST', body), cookies: cookiesOf(j) } as any);
	return { res, j, data: await res.json() };
}
async function rename(code: string, j: Jar, name: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const res = await meRoute({ params: { code }, request: req('PATCH', { name }), cookies: cookiesOf(j) } as any);
	return { status: res.status, data: await res.json() };
}
const player = (code: string, token: string) => jar({ [playerCookieName(code)]: token });
const names = (code: string) => [...getRoom(code)!.players.values()].map((p) => p.name);

describe('host name', () => {
	it('creates a room with a custom hostName', async () => {
		const { res, data } = await create({ hostName: '  Streamy  ' });
		expect(res.status).toBe(201);
		expect(names(data.code)).toEqual(['Streamy']);
	});

	it('defaults to Host', async () => {
		const { data } = await create({});
		expect(names(data.code)).toEqual(['Host']);
	});

	it('rejects invalid hostName', async () => {
		for (const hostName of ['', '   ', 'x'.repeat(21), 42]) {
			const { res } = await create({ hostName });
			expect(res.status).toBe(400);
		}
	});

	it('uses the stored hostName when hostPlays is toggled back on', async () => {
		const { data, j } = await create({ hostName: 'Streamy', settings: { hostPlays: false } });
		expect(names(data.code)).toEqual([]);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await settingsRoute({
			params: { code: data.code },
			request: req('PATCH', { hostPlays: true }),
			cookies: cookiesOf(j)
		} as any);
		expect(res.status).toBe(200);
		expect(names(data.code)).toEqual(['Streamy']);
	});
});

describe('PATCH /api/rooms/[code]/me', () => {
	it('renames the host player and keeps the name across a hostPlays toggle', async () => {
		const { data, j } = await create({});
		const r = await rename(data.code, j, 'Ash');
		expect(r).toEqual({ status: 200, data: { name: 'Ash' } });
		expect(names(data.code)).toEqual(['Ash']);
		expect(getRoom(data.code)!.hostName).toBe('Ash');
	});

	it('rejects duplicate names case insensitively, but allows changing own casing', async () => {
		const { data, j } = await create({});
		const room = getRoom(data.code)!;
		const ann = joinRoom(room, 'Ann');
		if (!ann.ok) throw new Error(ann.error);
		const aj = player(data.code, ann.value.token);
		expect((await rename(data.code, aj, 'host')).status).toBe(409);
		expect((await rename(data.code, j, 'ANN')).status).toBe(409);
		expect((await rename(data.code, aj, 'ANN')).status).toBe(200);
	});

	it('rejects invalid names with 400', async () => {
		const { data, j } = await create({});
		expect((await rename(data.code, j, '')).status).toBe(400);
		expect((await rename(data.code, j, 'y'.repeat(21))).status).toBe(400);
		expect((await rename(data.code, j, undefined)).status).toBe(400);
	});

	it('409 outside the lobby', async () => {
		const { data, j } = await create({});
		const room = getRoom(data.code)!;
		joinRoom(room, 'Ann');
		expect(startGame(room).ok).toBe(true);
		const r = await rename(data.code, j, 'Late');
		expect(r.status).toBe(409);
		expect(names(data.code)).toContain('Host');
	});

	it('401 without identity, 404 for unknown room', async () => {
		const { data } = await create({});
		expect((await rename(data.code, jar(), 'Nope')).status).toBe(401);
		// a host without a player entry cannot rename either
		const hostOnly = await create({ settings: { hostPlays: false } });
		const hj = jar({ [hostCookieName(hostOnly.data.code)]: getRoom(hostOnly.data.code)!.hostToken });
		expect((await rename(hostOnly.data.code, hj, 'Nope')).status).toBe(401);
		expect((await rename('ZZZZZZ', jar(), 'Nope')).status).toBe(404);
	});

	it('broadcasts player_renamed and a fresh snapshot to everyone', async () => {
		const { data, j } = await create({});
		const room = getRoom(data.code)!;
		const ann = joinRoom(room, 'Ann');
		if (!ann.ok) throw new Error(ann.error);
		const chunks: string[] = [];
		subscribe(room, { playerToken: ann.value.token }, (c) => chunks.push(c), () => {});
		chunks.length = 0;
		await rename(data.code, j, 'Ash');
		const all = chunks.join('');
		expect(all).toContain('event: player_renamed');
		expect(all).toMatch(/"name":"Ash"/);
		expect(all).toContain('event: snapshot');
	});

	it('a player renames only themselves; body playerId is ignored', async () => {
		const { data } = await create({});
		const room = getRoom(data.code)!;
		const ann = joinRoom(room, 'Ann');
		const bob = joinRoom(room, 'Bob');
		if (!ann.ok || !bob.ok) throw new Error('join failed');
		const aj = player(data.code, ann.value.token);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = await meRoute({
			params: { code: data.code },
			request: req('PATCH', { name: 'Anna', playerId: bob.value.id }),
			cookies: cookiesOf(aj)
		} as any);
		expect(res.status).toBe(200);
		expect(ann.value.name).toBe('Anna');
		expect(bob.value.name).toBe('Bob');
	});
});
