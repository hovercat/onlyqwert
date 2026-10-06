import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '#lib/types.ts';
import { subscriberCount } from '#lib/server/sse.ts';
import { Actor, answerOf, joined, newRoom, openStream, resetWorld, useFakeClock } from '../helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

const types = (s: { events: () => { event: string }[] }) => s.events().map((e) => e.event);

describe('GET /api/rooms/[code]/events', () => {
	it('is a no-cache event stream that starts with a snapshot for that viewer', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const s = await openStream(ann);
		expect(s.res.status).toBe(200);
		expect(s.res.headers.get('Content-Type')).toBe('text/event-stream');
		expect(s.res.headers.get('Cache-Control')).toContain('no-cache');
		await s.flush();
		expect(s.text().startsWith('event: snapshot\ndata: ')).toBe(true);
		const first = s.events()[0];
		expect(first.data).toMatchObject({ code: host.code, phase: 'lobby', you: { playerId: ann.me!.id, isHost: false } });
		expect(typeof first.data.serverNow).toBe('number');
	});

	it('401 for anonymous and forged identities, 404 for unknown rooms; the host may watch without playing', async () => {
		const host = await newRoom();
		const anon = new Actor(host.code);
		expect((await anon.events() as Response).status).toBe(401);
		anon.jar.set(`oq_player_${host.code}`, 'forged');
		expect((await anon.events() as Response).status).toBe(401);
		expect((await new Actor('ZZZZZZ').events() as Response).status).toBe(404);
		const s = await openStream(host);
		expect(s.res.status).toBe(200);
		await s.flush();
		expect(s.events()[0].data.you).toEqual({ playerId: undefined, isHost: true });
	});

	it('delivers a whole round in order: round_started, player_correct, round_ended, scoreboard, ...', async () => {
		const host = await newRoom({ rounds: 1, secondsPerRound: 10 });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const s = await openStream(bob);
		await openStream(ann);
		await s.flush();
		await host.start();
		await ann.guess(answerOf(host.room).name);
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(LIMITS.revealMs);
		await vi.advanceTimersByTimeAsync(LIMITS.leaderboardAutoMs);
		await s.flush();
		const seq = types(s).filter((t) => t !== 'snapshot');
		expect(seq).toEqual(['round_started', 'player_correct', 'round_ended', 'scoreboard', 'game_finished']);
		const ev = (name: string) => s.events().find((e) => e.event === name)!.data;
		expect(ev('round_started')).toMatchObject({ index: 0, total: 1 });
		expect(ev('round_started').endsAt - ev('round_started').startedAt).toBe(10_000);
		expect(ev('player_correct')).toMatchObject({ name: 'Ann', points: 100, order: 1 });
		expect(ev('scoreboard').players.map((p: { name: string }) => p.name)).toEqual(['Ann', 'Bob']);
		expect(ev('scoreboard').players[0]).not.toHaveProperty('connected');
		expect(ev('game_finished').podium).toHaveLength(2);
		// every event has a server clock
		for (const e of s.events()) expect(typeof e.data.serverNow).toBe('number');
		// the final snapshot says finished
		expect(s.events().at(-1)).toMatchObject({ event: 'snapshot', data: { phase: 'finished' } });
	});

	it('announces joins, leaves, settings and renames', async () => {
		const host = await newRoom();
		const watcher = await joined(host, 'Watcher');
		const s = await openStream(watcher);
		await s.flush();
		const n = s.events().length;
		const ann = await joined(host, 'Ann');
		await host.settings({ rounds: 5 });
		await ann.rename('Annie');
		await host.kick(ann.me!.id);
		await s.flush();
		const seq = s.events().slice(n).map((e) => e.event).filter((t) => t !== 'snapshot');
		expect(seq).toEqual(['player_joined', 'settings_updated', 'player_renamed', 'player_left']);
	});

	it('sends a keepalive comment every 15 seconds and stops after the stream ends', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const s = await openStream(ann);
		await vi.advanceTimersByTimeAsync(LIMITS.keepAliveMs - 1);
		expect(s.text()).not.toContain(': keepalive');
		await vi.advanceTimersByTimeAsync(1);
		await s.flush();
		expect(s.text()).toContain(': keepalive\n\n');
		s.abort();
		const timers = vi.getTimerCount();
		await vi.advanceTimersByTimeAsync(LIMITS.keepAliveMs * 3);
		expect(s.text().match(/: keepalive/g)).toHaveLength(1);
		expect(vi.getTimerCount()).toBeLessThanOrEqual(timers);
	});

	it('each viewer gets a snapshot computed for themselves (only the guesser sees the answer)', async () => {
		const host = await newRoom({ secondsPerRound: 30 });
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const sa = await openStream(ann);
		const sb = await openStream(bob);
		await host.start();
		await ann.guess(answerOf(host.room).name);
		await sa.flush();
		await sb.flush();
		const last = (s: typeof sa) => s.events().filter((e) => e.event === 'snapshot').at(-1)!.data;
		expect(last(sa).revealed).not.toBeNull();
		expect(last(sa).you.playerId).toBe(ann.me!.id);
		expect(last(sb).revealed).toBeNull();
		expect(last(sb).you.playerId).toBe(bob.me!.id);
	});
});

describe('connection tracking', () => {
	it('marks a player offline after a 10s grace, and a reconnect inside the grace keeps them online', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const watch = await openStream(bob);
		const a1 = await openStream(ann);
		expect(subscriberCount(host.code)).toBe(2);
		a1.abort();
		expect(subscriberCount(host.code)).toBe(1);
		await vi.advanceTimersByTimeAsync(LIMITS.disconnectGraceMs - 1);
		expect(ann.me!.connected).toBe(true);
		const a2 = await openStream(ann); // reconnect in time
		await vi.advanceTimersByTimeAsync(LIMITS.disconnectGraceMs * 2);
		expect(ann.me!.connected).toBe(true);
		a2.abort();
		await vi.advanceTimersByTimeAsync(LIMITS.disconnectGraceMs);
		expect(ann.me!.connected).toBe(false);
		await watch.flush();
		const left = watch.events().filter((e) => e.event === 'player_left');
		expect(left).toHaveLength(1);
		expect((await bob.snapshot()).body.players.find((p: { name: string }) => p.name === 'Ann').connected).toBe(false);
		// coming back flips the flag again and tells everyone
		await openStream(ann);
		expect(ann.me!.connected).toBe(true);
		await watch.flush();
		expect(watch.events().filter((e) => e.event === 'player_joined').at(-1)!.data.player.name).toBe('Ann');
	});

	it('a joined player who never opens a stream goes offline after the grace', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		expect(ann.me!.connected).toBe(true);
		await vi.advanceTimersByTimeAsync(LIMITS.disconnectGraceMs);
		expect(ann.me!.connected).toBe(false);
	});

	it('two tabs: closing one keeps the player online', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const t1 = await openStream(ann);
		await openStream(ann);
		t1.abort();
		await vi.advanceTimersByTimeAsync(LIMITS.disconnectGraceMs * 2);
		expect(ann.me!.connected).toBe(true);
	});

	it('kicking closes the stream without arming a grace timer; the room closes all streams on delete', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const bob = await joined(host, 'Bob');
		const sa = await openStream(ann);
		const sb = await openStream(bob);
		const base = vi.getTimerCount();
		await host.kick(ann.me!.id);
		await sa.flush();
		expect(sa.isClosed()).toBe(true);
		sa.abort();
		expect(vi.getTimerCount()).toBeLessThan(base); // keepalive of Ann removed, no new grace timer
		const { deleteRoom } = await import('#lib/server/rooms.ts');
		deleteRoom(host.room, 'test');
		await sb.flush();
		expect(sb.isClosed()).toBe(true);
		expect(sb.events().at(-1)).toMatchObject({ event: 'room_closed', data: { reason: 'test' } });
		expect(subscriberCount(host.code)).toBe(0);
		sb.abort();
		// only the idle sweeper remains
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(60_000);
	});

	it('cancelling the response body (client went away) unsubscribes', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const res = (await ann.events()) as Response;
		expect(subscriberCount(host.code)).toBe(1);
		await res.body!.cancel();
		expect(subscriberCount(host.code)).toBe(0);
	});
});
