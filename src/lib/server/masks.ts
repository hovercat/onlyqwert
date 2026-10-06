import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentRound } from './game';
import type { Room } from './types';

// 1x1 transparent PNG, used only if assets/masks/{id}.png is missing (dev without assets).
const PLACEHOLDER = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

/** PNG bytes for a mask token of the latest round, or null for stale/unknown tokens. */
export async function readMask(room: Room, maskToken: string): Promise<Buffer | null> {
	const round = currentRound(room);
	if (!round || room.phase === 'lobby' || round.maskToken !== maskToken) return null;
	try {
		return await readFile(join(process.cwd(), 'assets', 'masks', `${round.pokemonId}.png`));
	} catch {
		return PLACEHOLDER;
	}
}
