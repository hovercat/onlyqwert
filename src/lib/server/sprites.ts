import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolvePlayer, roundEnded } from './snapshot';
import type { Room } from './types';

/**
 * PNG bytes for a sprite token, or null when the token is unknown/stale or the viewer is not yet
 * allowed to see it (round still active and viewer has not guessed correctly). Callers answer 404
 * for null so existence is never revealed.
 */
export async function readSprite(
	room: Room,
	spriteToken: string,
	viewer: { playerToken?: string; hostToken?: string }
): Promise<Buffer | null> {
	const round = room.rounds.find((r) => r.spriteToken === spriteToken);
	if (!round) return null;
	if (!roundEnded(room, round)) {
		const player = resolvePlayer(room, viewer);
		if (!player || !round.correct.some((c) => c.playerId === player.id)) return null;
	}
	try {
		return await readFile(join(process.cwd(), 'assets', 'sprites', `${round.pokemonId}.png`));
	} catch {
		return null;
	}
}
