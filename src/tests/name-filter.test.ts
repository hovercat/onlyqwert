import { afterEach, describe, expect, it } from 'vitest';
import { isOffensiveName } from '#lib/server/nameFilter.ts';
import { Actor, joined, newRoom, resetWorld } from './helpers.ts';

afterEach(resetWorld);

describe('isOffensiveName', () => {
	it.each([
		'assinspector67',
		'Ash',
		'Misty',
		'Raccoon',
		'SpicyBoi',
		'Japan Fan',
		'Montenegro',
		'Kiki',
		'Mikkel',
		'Heiligenschein',
		'Sassy',
		'Kakkoii',
		'Hitchcock',
		'Pikachu88',
		'Jessica',
		'Señor Qwert',
		'ピカチュウ',
		'Glurak'
	])('allows %s', (name) => {
		expect(isOffensiveName(name)).toBe(false);
	});

	it.each([
		'nigger',
		'N1GG3R',
		'n i g g a',
		'niiiggggaaa',
		'k.i.k.e',
		'kikehunter',
		'HeilHitler',
		'H1tl3r_fan',
		'adolf hitler',
		'Sieg Heil',
		'heil',
		'GasTheJews',
		'Juden-Sau',
		'xX1488Xx',
		'14/88',
		'NaziPikachu',
		'KKKmember',
		'Auschwitz',
		'Untermensch',
		'faggot',
		'spic',
		'jap 67',
		'coon',
		'SS',
		'Zigeuner',
		'WhitePower'
	])('blocks %s', (name) => {
		expect(isOffensiveName(name)).toBe(true);
	});
});

describe('name filter on the API', () => {
	it('rejects an offensive join with 400 and keeps the player out', async () => {
		const host = await newRoom();
		const r = await new Actor(host.code).join('H1tl3r');
		expect(r.status).toBe(400);
		expect(r.body.error).toMatch(/not allowed/);
		const snap = await host.snapshot();
		expect(snap.body.players).toHaveLength(0);
	});

	it('allows mildly rude names', async () => {
		const host = await newRoom();
		await expect(joined(host, 'assinspector67')).resolves.toBeDefined();
	});

	it('rejects an offensive host name on create', async () => {
		const r = await new Actor().create({ hostName: 'SiegHeil', settings: { hostPlays: true } });
		expect(r.status).toBe(400);
	});

	it('rejects renaming to an offensive name', async () => {
		const host = await newRoom();
		const ann = await joined(host, 'Ann');
		const r = await ann.rename('K1ke');
		expect(r.status).toBe(400);
		const snap = await host.snapshot();
		expect(snap.body.players.map((p: { name: string }) => p.name)).toEqual(['Ann']);
	});
});
