import type { PokemonEntry } from '../types';

const GEN_RANGES: [number, number][] = [
	[1, 151],
	[152, 251],
	[252, 386],
	[387, 493],
	[494, 649],
	[650, 721],
	[722, 809],
	[810, 905],
	[906, 1025]
];

// The data file is produced by stream A. If it is missing (dev only) fall back to placeholders.
const modules = import.meta.glob<PokemonEntry[]>('../data/pokemon.json', {
	eager: true,
	import: 'default'
});

function fallback(): PokemonEntry[] {
	const out: PokemonEntry[] = [];
	GEN_RANGES.forEach(([lo, hi], i) => {
		for (let id = lo; id <= hi; id++) out.push({ id, name: `Pokemon${id}`, generation: i + 1 });
	});
	return out;
}

const all: PokemonEntry[] = Object.values(modules)[0] ?? fallback();
const byId = new Map(all.map((p) => [p.id, p]));

export function getPokemon(id: number): PokemonEntry | undefined {
	return byId.get(id);
}

export function getAllPokemon(): readonly PokemonEntry[] {
	return all;
}

/**
 * Picks a random Pokemon from the given generations that is not in `used`.
 * When every Pokemon of those generations is used, their ids are removed from `used`
 * (mutating it) and the pool starts over. The caller adds the returned id to `used`.
 * `pool` is injectable for tests. Returns undefined only if no Pokemon matches.
 */
export function pickPokemon(
	generations: readonly number[],
	used: Set<number>,
	rng: () => number = Math.random,
	pool: readonly PokemonEntry[] = all
): PokemonEntry | undefined {
	const candidates = pool.filter((p) => generations.includes(p.generation));
	if (candidates.length === 0) return undefined;
	let free = candidates.filter((p) => !used.has(p.id));
	if (free.length === 0) {
		for (const p of candidates) used.delete(p.id);
		free = candidates;
	}
	return free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
}
