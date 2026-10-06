import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAcceptedSet, isCorrectGuess, normalizeName } from '#lib/game/normalize.ts';
import { __resetRooms, createRoom, joinRoom } from '#lib/server/rooms.ts';
import { startGame } from '#lib/server/game.ts';
import { submitGuess } from '#lib/server/guess.ts';
import { getAllPokemon, getPokemon } from '#lib/server/pokemon.ts';

function ok(guess: string, id: number) {
	const p = getPokemon(id)!;
	return isCorrectGuess(guess, p.name, p.aliases);
}

describe('normalizeName', () => {
	it('keeps English behaviour', () => {
		expect(normalizeName('Mr. Mime')).toBe('mrmime');
		expect(normalizeName("Farfetch'd")).toBe('farfetchd');
		expect(normalizeName('Flabébé')).toBe('flabebe');
		expect(normalizeName('Type: Null')).toBe('typenull');
		expect(normalizeName('Nidoran♀')).toBe('nidoran');
		expect(normalizeName('Nidoran♂')).toBe('nidoran');
	});
	it('folds fullwidth, sharp s, umlauts and kana', () => {
		expect(normalizeName('ＰＩＫＡＣＨＵ')).toBe('pikachu');
		expect(normalizeName('Größe')).toBe('grosse');
		expect(normalizeName('Müll')).toBe('mull');
		expect(normalizeName('ピカチュウ')).toBe(normalizeName('ぴかちゅう'));
		expect(normalizeName('ﾋﾟｶﾁｭｳ')).toBe(normalizeName('ぴかちゅう'));
		expect(normalizeName('ガ')).not.toBe(normalizeName('か'));
		expect(normalizeName('ミスター・ミime')).toBe(normalizeName('ミスターミime'));
	});
	it('preserves Hangul and Han', () => {
		expect(normalizeName('피카츄')).toBe('피카츄');
		expect(normalizeName('皮卡丘')).toBe('皮卡丘');
	});
});

describe('localized names', () => {
	it('accepts Pikachu in every language', () => {
		for (const g of ['Pikachu', 'ピカチュウ', 'ぴかちゅう', 'ﾋﾟｶﾁｭｳ', '피카츄', '皮卡丘', 'pikachu', ' PIKACHU ']) {
			expect(ok(g, 25), g).toBe(true);
		}
		expect(ok('Raichu', 25)).toBe(false);
	});
	it('accepts German, French and others', () => {
		expect(ok('Glurak', 6)).toBe(true);
		expect(ok('Dracaufeu', 6)).toBe(true);
		expect(ok('Charizard', 6)).toBe(true);
		expect(ok('Bisasam', 1)).toBe(true);
		expect(ok('Pantimos', 122)).toBe(true);
		expect(ok('M. Mime', 122)).toBe(true);
		expect(ok('mr mime', 122)).toBe(true);
		expect(ok('バリヤード', 122)).toBe(true);
		expect(ok('nidoranf', 29)).toBe(true);
		expect(ok('nidoran', 32)).toBe(true);
	});
	it('accepts roomaji, traditional and simplified Chinese', () => {
		expect(ok('Barrierd', 122)).toBe(true);
		expect(ok('魔牆人偶', 122)).toBe(true);
		expect(ok('魔墙人偶', 122)).toBe(true);
	});
});

describe('guess endpoint level', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
	});
	afterEach(() => {
		__resetRooms();
		vi.useRealTimers();
	});
	it('scores a German name as correct', () => {
		const r = createRoom({ hostPlays: false, rounds: 1, secondsPerRound: 10 });
		if (!r.ok) throw new Error(r.error);
		const room = r.value;
		const a = joinRoom(room, 'Ann');
		if (!a.ok) throw new Error(a.error);
		expect(startGame(room).ok).toBe(true);
		room.rounds[0].pokemonId = 6;
		vi.advanceTimersByTime(5000);
		expect(submitGuess(room, a.value.token, 'Glurak', 0)).toMatchObject({ status: 'correct', points: 50, pokemon: { name: 'Charizard', generation: 1 } });
	});
});

describe('alias safety across the dataset', () => {
	it('never collapses two different Pokemon into one name (except Nidoran female/male)', () => {
		const owner = new Map<string, number>();
		const clashes: string[] = [];
		for (const p of getAllPokemon()) {
			for (const v of buildAcceptedSet(p.name, p.aliases)) {
				const prev = owner.get(v);
				if (prev !== undefined && prev !== p.id && !(prev === 29 && p.id === 32)) clashes.push(`${v}: ${prev}/${p.id}`);
				owner.set(v, p.id);
			}
		}
		expect(clashes).toEqual([]);
	});
	it('rejects empty and single Latin or kana guesses', () => {
		for (const g of ['', '   ', '!!', '♀', '・', 'a', 'Ａ', 'é', 'ぴ']) expect(ok(g, 151), g).toBe(false);
		expect(ok('뮤', 151)).toBe(true);
		expect(ok('뮤', 25)).toBe(false);
	});
});
