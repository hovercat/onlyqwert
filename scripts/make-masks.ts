// Trims each sprite to its alpha bounds (in place) and writes a solid silhouette
// mask to assets/masks/{id}.png. Masks carry only alpha, no color info, no metadata.
// Idempotent: trimming an already trimmed sprite is a no-op.
// Usage: node scripts/make-masks.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const MAX_ID = 1025;
const COLOR = { r: 11, g: 8, b: 32 }; // #0b0820
const spriteDir = new URL('../assets/sprites/', import.meta.url).pathname;
const maskDir = new URL('../assets/masks/', import.meta.url).pathname;
mkdirSync(maskDir, { recursive: true });

const missing: number[] = [];
for (let id = 1; id <= MAX_ID; id++) {
	const src = `${spriteDir}${id}.png`;
	if (!existsSync(src)) {
		missing.push(id);
		continue;
	}
	const input = readFileSync(src);
	// Trim fully transparent border (threshold 0 on alpha only).
	const { data, info } = await sharp(input)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
	for (let y = 0; y < info.height; y++)
		for (let x = 0; x < info.width; x++)
			if (data[(y * info.width + x) * 4 + 3] > 0) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
	if (maxX < 0) throw new Error(`sprite ${id} is fully transparent`);
	const w = maxX - minX + 1;
	const h = maxY - minY + 1;
	const region = { left: minX, top: minY, width: w, height: h };

	const trimmed = await sharp(input).ensureAlpha().extract(region).png({ compressionLevel: 9 }).toBuffer();
	writeFileSync(src, trimmed);

	// Mask: alpha thresholded to a hard edge, flat color, no metadata (sharp strips by default).
	const alpha = await sharp(trimmed).extractChannel(3).threshold(1).toBuffer();
	const mask = await sharp({ create: { width: w, height: h, channels: 3, background: COLOR } })
		.joinChannel(alpha)
		.png({ compressionLevel: 9 })
		.toBuffer();
	writeFileSync(`${maskDir}${id}.png`, mask);
}
console.log(`masks done, missing sprites: ${missing.length ? missing.join(',') : 'none'}`);
process.exitCode = missing.length ? 1 : 0;
