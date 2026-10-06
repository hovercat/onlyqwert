// Downloads front sprites for national dex 1..1025 into static/sprites/{id}.png.
// Source: PokeAPI/sprites (no reliable downloadable Radical Red set exists).
// Downloads land in a fresh temp dir, are validated as real PNGs, then copied.
// Usage: node scripts/download-sprites.ts [--force]
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

const MAX_ID = 1025;
const CONCURRENCY = 8;
const MAX_BYTES = 512 * 1024;
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const force = process.argv.includes('--force');

const outDir = new URL('../static/sprites/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'sprites-'));

async function valid(buf: Buffer): Promise<boolean> {
	if (buf.length < 100 || buf.length > MAX_BYTES || !buf.subarray(0, 8).equals(SIG)) return false;
	try {
		const m = await sharp(buf).metadata();
		return m.format === 'png' && !!m.width && !!m.height && m.width <= 1024 && m.height <= 1024;
	} catch {
		return false;
	}
}

async function fetchOne(id: number): Promise<boolean> {
	const dest = join(outDir, `${id}.png`);
	if (!force && existsSync(dest) && (await valid(readFileSync(dest)))) return true;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(`${BASE}/${id}.png`);
			if (!res.ok) continue;
			const buf = Buffer.from(await res.arrayBuffer());
			if (!(await valid(buf))) continue;
			const tmpFile = join(tmp, `${id}.png`);
			writeFileSync(tmpFile, buf);
			copyFileSync(tmpFile, dest);
			return true;
		} catch {
			/* retry */
		}
	}
	return false;
}

const queue = Array.from({ length: MAX_ID }, (_, i) => i + 1);
const missing: number[] = [];
await Promise.all(
	Array.from({ length: CONCURRENCY }, async () => {
		for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
			if (!(await fetchOne(id))) missing.push(id);
		}
	})
);
rmSync(tmp, { recursive: true, force: true });
console.log(`done, missing: ${missing.length ? missing.sort((a, b) => a - b).join(',') : 'none'}`);
process.exitCode = missing.length ? 1 : 0;
