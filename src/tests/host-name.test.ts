import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hostCookieName } from '#lib/types.ts';
import { startGame } from '#lib/server/game.ts';
import { Actor, Jar, joined, newRoom, openStream, resetWorld, useFakeClock } from './helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

const names = (a: Actor) => [...a.room.players.values()].map((p) => p.name);

describe('host name', () => {
	it('creates a room with a custom hostName (trimmed)', async () => {
		const host = new Actor();
		expect((await host.create({ hostName: '  Streamy  ' })).status).toBe(201);
		expect(names(host)).toEqual(['Streamy']);
	});

	it('defaults to Host', async () => {
		const host = new Actor();
		await host.create({});
		expect(names(host)).toEqual(['Host']);
	});

	it('rejects invalid hostName', async () => {
		for (const hostName of ['', '   ', 'x'.repeat(21), 42]) {
			expect((await new Actor().create({ hostName })).status).toBe(400);
		}
	});

	it('uses the stored hostName when hostPlays is toggled back on', async () => {
		const host = new Actor();
		await host.create({ hostName: 'Streamy', settings: { hostPlays: false } });
		expect(names(host)).toEqual([]);
		expect((await host.settings({ hostPlays: true })).status).toBe(200);
		expect(names(host)).toEqual(['Streamy']);
	});

	it('keeps a renamed host name across a hostPlays off/on toggle', async () => {
		const host = new Actor();
		await host.create({});
		await host.rename('Ash');
		await host.settings({ hostPlays: false });
		await host.settings({ hostPlays: true });
		expect(names(host)).toEqual(['Ash']);
	});
});

describe('PATCH /api/rooms/[code]/me', () => {
	it('renames the host player and the stored hostName', async () => {
		const host = new Actor();
		await host.create({});
		const r = await host.rename('Ash');
		expect(r).toMatchObject({ status: 200, body: { name: 'Ash' } });
		expect(names(host)).toEqual(['Ash']);
		expect(host.room.hostName).toBe('Ash');
	});

	it('renames a joined player, trimming and collapsing whitespace', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		expect((await ann.rename('  Anna   Lee ')).body).toEqual({ name: 'Anna Lee' });
		expect(ann.me!.name).toBe('Anna Lee');
		expect(host.room.hostName).toBe('Host');
	});

	it('rejects duplicate names case insensitively, but allows changing own casing', async () => {
		const host = new Actor();
		await host.create({});
		const ann = await joined(host, 'Ann');
		expect((await ann.rename('host')).status).toBe(409);
		expect((await host.rename('ANN')).status).toBe(409);
		expect((await ann.rename('ANN')).status).toBe(200);
		expect(ann.me!.name).toBe('ANN');
	});

	it('rejects invalid names with 400 and keeps the old name', async () => {
		const host = new Actor();
		await host.create({});
		for (const name of ['', '   ', 'y'.repeat(21), undefined, 7, null]) {
			expect((await host.rename(name)).status).toBe(400);
		}
		expect(names(host)).toEqual(['Host']);
	});

	it('409 outside the lobby', async () => {
		const host = new Actor();
		await host.create({});
		await joined(host, 'Ann');
		expect(startGame(host.room).ok).toBe(true);
		expect((await host.rename('Late')).status).toBe(409);
		expect(names(host)).toContain('Host');
	});

	it('401 without identity (also for a host who does not play), 404 for an unknown room', async () => {
		const host = new Actor();
		await host.create({});
		expect((await new Actor(host.code).rename('Nope')).status).toBe(401);
		const hostOnly = await newRoom();
		const hj = new Actor(hostOnly.code, new Jar({ [hostCookieName(hostOnly.code)]: hostOnly.room.hostToken }));
		expect((await hj.rename('Nope')).status).toBe(401);
		expect((await new Actor('ZZZZZZ').rename('Nope')).status).toBe(404);
	});

	it('broadcasts player_renamed and a fresh snapshot to everyone', async () => {
		const host = new Actor();
		await host.create({});
		const ann = await joined(host, 'Ann');
		const s = await openStream(ann);
		const n = s.events().length;
		await host.rename('Ash');
		await s.flush();
		const fresh = s.events().slice(n);
		expect(fresh.map((e) => e.event)).toEqual(['player_renamed', 'snapshot']);
		expect(fresh[0].data).toMatchObject({ playerId: host.me!.id, name: 'Ash' });
		expect(fresh[1].data.players.map((p: { name: string }) => p.name)).toContain('Ash');
	});

	it('a player renames only themselves; a body playerId is ignored', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const { call } = await import('./helpers.ts');
		const { PATCH } = await import('../routes/api/rooms/[code]/me/+server.ts');
		const r = await call(PATCH, {
			method: 'PATCH',
			jar: ann.jar,
			params: { code: host.code },
			body: { name: 'Anna', playerId: bob.me!.id }
		});
		expect(r.status).toBe(200);
		expect(ann.me!.name).toBe('Anna');
		expect(bob.me!.name).toBe('Bob');
	});
});
