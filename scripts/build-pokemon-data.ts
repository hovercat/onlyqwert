// Builds src/lib/data/pokemon.json from PokeAPI species names (CSV).
// Usage: node scripts/build-pokemon-data.ts
import { writeFileSync } from 'node:fs';
import { normalizeName } from '../src/lib/game/normalize.ts';

const CSV_URL =
	'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const MAX_ID = 1025;
const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];

const EXTRA_ALIASES: Record<number, string[]> = {
	29: ['nidoranf', 'nidoran'],
	32: ['nidoranm', 'nidoran']
};

function parseLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				cur += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cur += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ',') {
			out.push(cur);
			cur = '';
		} else cur += ch;
	}
	out.push(cur);
	return out;
}

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error(`CSV download failed: ${res.status}`);
const lines = (await res.text()).split('\n').slice(1);

const names = new Map<number, string>();
const localized = new Map<number, string[]>();
for (const line of lines) {
	if (!line.trim()) continue;
	const [id, lang, name] = parseLine(line);
	if (!name) continue;
	const list = localized.get(Number(id)) ?? [];
	list.push(name.replace(/[‘’]/g, "'").trim());
	localized.set(Number(id), list);
	if (lang === '9') names.set(Number(id), name.replace(/[‘’]/g, "'").trim());
}

const out = [];
for (let id = 1; id <= MAX_ID; id++) {
	const name = names.get(id);
	if (!name) throw new Error(`missing name for ${id}`);
	const generation = GEN_END.findIndex((end) => id <= end) + 1;
	const entry: { id: number; name: string; generation: number; aliases?: string[] } = {
		id,
		name,
		generation
	};
	// Every localized name, deduplicated after normalization; the English name is the display name.
	const seen = new Set([normalizeName(name)]);
	const aliases: string[] = [];
	for (const a of [...(EXTRA_ALIASES[id] ?? []), ...(localized.get(id) ?? [])]) {
		const key = normalizeName(a);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		aliases.push(a);
	}
	if (aliases.length) entry.aliases = aliases;
	out.push(entry);
}
writeFileSync(new URL('../src/lib/data/pokemon.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`wrote ${out.length} entries`);
