import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, playerCookieName } from '#lib/types.ts';
import { Actor, answerOf, joined, newRoom, openStream, resetWorld, useFakeClock } from '../helpers.ts';

beforeEach(() => useFakeClock());
afterEach(resetWorld);

const PNG = [0x89, 0x50, 0x4e, 0x47];
const isPng = async (res: Response) => [...new Uint8Array(await res.clone().arrayBuffer()).slice(0, 4)];

async function game() {
	const host = await newRoom({ rounds: 3, secondsPerRound: 20 });
	const ann = await joined(host, 'Ann');
	const bob = await joined(host, 'Bob');
	const cat = await joined(host, 'Cat');
	await host.start();
	return { host, ann, bob, cat };
}

describe('mask endpoint', () => {
	it('serves a no-store PNG for the current round token, with no redirect', async () => {
		const { host, bob } = await game();
		const round = host.room.rounds[0];
		const r = await bob.mask(round.maskToken);
		expect(r.status).toBe(200);
		expect(r.headers.get('Content-Type')).toBe('image/png');
		expect(r.headers.get('Cache-Control')).toBe('no-store');
		expect(r.headers.get('Location')).toBeNull();
		expect(await isPng(r.res)).toEqual(PNG);
		// anonymous visitors may load the mask too (it is public by design)
		expect((await new Actor(host.code).mask(round.maskToken)).status).toBe(200);
	});

	it('does not expose the Pokemon id in url, headers or the snapshot mask url', async () => {
		const { host, bob } = await game();
		const round = host.room.rounds[0];
		const id = String(round.pokemonId);
		const snap = (await bob.snapshot()).body;
		expect(snap.round.maskUrl).toBe(`/api/rooms/${host.code}/mask/${round.maskToken}`);
		expect(snap.round.maskUrl.split('/').pop()).toMatch(/^[0-9a-f]{24}$/);
		expect(snap.round.maskUrl.split('/').pop()).not.toContain(id);
		const r = await bob.mask(round.maskToken);
		const headers = JSON.stringify([...r.headers.entries()]);
		expect(headers).not.toMatch(new RegExp(`(^|\\D)${id}(\\D|$)`));
	});

	it('404s uniformly: unknown token, sprite token, lobby, stale token after the next round', async () => {
		const { host, bob } = await game();
		const r0 = host.room.rounds[0];
		const unknown = await bob.mask('0'.repeat(24));
		const asSprite = await bob.mask(r0.spriteToken);
		expect(unknown.status).toBe(404);
		expect(asSprite.status).toBe(404);
		expect(asSprite.body).toEqual(unknown.body);
		expect(asSprite.headers.get('Content-Type')).toBe(unknown.headers.get('Content-Type'));
		// advance to round 2: the old mask token is stale
		await vi.advanceTimersByTimeAsync(20_000 + LIMITS.revealMs);
		await host.next();
		const r1 = host.room.rounds[1];
		expect(r1.maskToken).not.toBe(r0.maskToken);
		expect((await bob.mask(r0.maskToken)).status).toBe(404);
		expect((await bob.mask(r1.maskToken)).status).toBe(200);
	});

	it('404 for a lobby room and for an unknown room', async () => {
		const host = await newRoom();
		expect((await host.mask('abc')).status).toBe(404);
		expect((await new Actor('ZZZZZZ').mask('abc')).status).toBe(404);
	});

	it('the mask is not the colored sprite', async () => {
		const { host, ann } = await game();
		const round = host.room.rounds[0];
		await ann.guess(answerOf(host.room).name);
		const mask = Buffer.from(await (await ann.mask(round.maskToken)).res.arrayBuffer());
		const sprite = Buffer.from(await (await ann.sprite(round.spriteToken)).res.arrayBuffer());
		expect(mask.equals(sprite)).toBe(false);
	});

	it('mask and sprite tokens are distinct random values every round and never repeat', async () => {
		const host = await newRoom({ rounds: 6, secondsPerRound: 5 });
		await joined(host, 'Ann');
		await host.start();
		await vi.advanceTimersByTimeAsync(6 * (5000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs));
		const tokens = host.room.rounds.flatMap((r) => [r.maskToken, r.spriteToken]);
		expect(tokens).toHaveLength(12);
		expect(new Set(tokens).size).toBe(12);
		for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{24}$/);
	});
});

describe('sprite endpoint', () => {
	it('uniform 404 (same status, body and headers) for every reason', async () => {
		const { host, ann, bob } = await game();
		const round = host.room.rounds[0];
		await ann.guess(answerOf(host.room).name); // ann may see it, nobody else
		const forged = new Actor(host.code);
		forged.jar.set(playerCookieName(host.code), 'forged');
		const attempts = [
			await bob.sprite(round.spriteToken), // not guessed yet
			await new Actor(host.code).sprite(round.spriteToken), // anonymous
			await forged.sprite(round.spriteToken),
			await host.sprite(round.spriteToken), // host who does not play
			await ann.sprite('f'.repeat(24)), // unknown token
			await ann.sprite(round.maskToken) // mask token
		];
		for (const a of attempts) {
			expect(a.status).toBe(404);
			expect(a.body).toEqual(attempts[0].body);
			expect(a.headers.get('Content-Type')).toBe(attempts[0].headers.get('Content-Type'));
		}
		expect((await ann.sprite(round.spriteToken)).status).toBe(200);
	});

	it('own correct guess reveals the sprite only to that player; no-store; png', async () => {
		const { host, ann, bob } = await game();
		const round = host.room.rounds[0];
		const r = await ann.guess(answerOf(host.room).name);
		const url = new URL(r.body.spriteUrl, 'http://x').pathname.split('/').pop()!;
		expect((await ann.sprite(url)).status).toBe(200);
		const ok = await ann.sprite(url);
		expect(ok.headers.get('Cache-Control')).toBe('no-store');
		expect(await isPng(ok.res)).toEqual(PNG);
		expect((await bob.sprite(url)).status).toBe(404);
		void round;
	});

	it('a playing host is authorised through the host cookie alone', async () => {
		const host = await newRoom({ hostPlays: true });
		await joined(host, 'Ann');
		await host.start();
		const token = host.room.rounds[0].spriteToken;
		const hostOnly = new Actor(host.code);
		hostOnly.jar.set(`oq_host_${host.code}`, host.room.hostToken);
		expect((await hostOnly.sprite(token)).status).toBe(404);
		expect((await hostOnly.guess(answerOf(host.room).name)).body.status).toBe('correct');
		expect((await hostOnly.sprite(token)).status).toBe(200);
		expect((await hostOnly.snapshot()).body.revealed).not.toBeNull();
	});

	it('everyone may fetch it once the round ended, and it stays available for past rounds only', async () => {
		const { host, bob } = await game();
		const r0 = host.room.rounds[0];
		await vi.advanceTimersByTimeAsync(20_000);
		expect((await bob.sprite(r0.spriteToken)).status).toBe(200);
		await vi.advanceTimersByTimeAsync(LIMITS.revealMs);
		await host.next();
		const r1 = host.room.rounds[1];
		expect((await bob.sprite(r0.spriteToken)).status).toBe(200);
		expect((await bob.sprite(r1.spriteToken)).status).toBe(404);
	});

	it('after a restart old sprite tokens are gone', async () => {
		const host = await newRoom({ rounds: 1, secondsPerRound: 5 });
		const ann = await joined(host, 'Ann');
		await host.start();
		const token = host.room.rounds[0].spriteToken;
		await vi.advanceTimersByTimeAsync(5000 + LIMITS.revealMs + LIMITS.leaderboardAutoMs);
		expect((await ann.sprite(token)).status).toBe(200);
		await host.restart();
		expect((await ann.sprite(token)).status).toBe(404);
	});
});

describe('no secrets in any payload', () => {
	it('snapshots, SSE and responses never contain tokens, ids or the answer before it is allowed', async () => {
		const { host, ann, bob, cat } = await game();
		const watchers = { ann: await openStream(ann), bob: await openStream(bob), cat: await openStream(cat) };
		const hostStream = await openStream(host);
		const answer = answerOf(host.room);
		const quoted = `"${answer.name}"`;
		const round = host.room.rounds[0];
		const secrets = [host.room.hostToken, ...[ann, bob, cat].map((a) => a.me!.token)];
		const idRe = new RegExp(`"(id|pokemonId|pokemon_id)":\\s*${answer.id}\\b`);

		const wrong = await ann.guess('definitely not');
		expect(JSON.stringify(wrong.body)).not.toContain(quoted);
		await bob.guess('also wrong');
		const snapshots = [
			(await new Actor(host.code).snapshot()).body,
			(await bob.snapshot()).body,
			(await host.snapshot()).body
		];
		for (const s of snapshots) {
			expect(s.revealed).toBeNull();
			expect(JSON.stringify(s)).not.toContain(quoted);
			expect(JSON.stringify(s)).not.toContain(round.spriteToken);
		}

		// Ann guesses right: she (and only she) learns the answer
		const right = await ann.guess(answer.name);
		expect(right.body.status).toBe('correct');
		for (const w of [...Object.values(watchers), hostStream]) await w.flush();
		expect(watchers.ann.text()).toContain(quoted);
		for (const w of [watchers.bob, watchers.cat, hostStream]) {
			expect(w.text()).not.toContain(quoted);
			expect(w.text()).not.toContain(round.spriteToken);
			// the others do learn who was right, and how many points
			expect(w.events().some((e) => e.event === 'player_correct' && e.data.name === 'Ann')).toBe(true);
		}
		expect((await bob.snapshot()).body.revealed).toBeNull();
		expect((await ann.snapshot()).body.revealed?.pokemon.name).toBe(answer.name);

		// the round ends: now everybody gets the reveal
		await vi.advanceTimersByTimeAsync(20_000);
		for (const w of [...Object.values(watchers), hostStream]) await w.flush();
		for (const w of [watchers.bob, watchers.cat, hostStream]) {
			const ended = w.events().find((e) => e.event === 'round_ended')!;
			expect(ended.data.pokemon).toEqual({ name: answer.name, generation: answer.generation });
			expect(ended.data.spriteUrl).toContain(round.spriteToken);
		}
		await vi.advanceTimersByTimeAsync(LIMITS.revealMs);
		await host.next();
		await vi.advanceTimersByTimeAsync(20_000 + LIMITS.revealMs);
		for (const w of [...Object.values(watchers), hostStream]) await w.flush();

		// across the whole stream history: no tokens of anybody, no numeric Pokemon ids
		for (const w of [...Object.values(watchers), hostStream]) {
			for (const secret of secrets) expect(w.text()).not.toContain(secret);
			expect(w.text()).not.toMatch(/pokemonId|pokemon_id/);
			expect(w.text()).not.toMatch(idRe);
			for (const e of w.events()) {
				const walk = (v: unknown): void => {
					if (Array.isArray(v)) v.forEach(walk);
					else if (v && typeof v === 'object') {
						for (const [k, x] of Object.entries(v)) {
							if (k === 'id') expect(typeof x, 'ids are uuid strings').toBe('string');
							walk(x);
						}
					}
				};
				walk(e.data);
				expect(typeof e.data.serverNow).toBe('number');
			}
		}
		for (const s of [(await bob.snapshot()).body, (await host.snapshot()).body]) {
			for (const secret of secrets) expect(JSON.stringify(s)).not.toContain(secret);
		}
	});

	it('the reveal of a past round never reveals the active round', async () => {
		const { host, bob } = await game();
		await vi.advanceTimersByTimeAsync(20_000 + LIMITS.revealMs);
		await host.next();
		const snap = (await bob.snapshot()).body;
		expect(snap.phase).toBe('round_active');
		expect(snap.revealed).toBeNull();
		expect(snap.round.index).toBe(1);
		expect(JSON.stringify(snap)).not.toContain(`"${answerOf(host.room).name}"`);
	});
});
