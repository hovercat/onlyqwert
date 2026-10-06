/**
 * points = 50 + round(50 * timeLeft / duration), range 50..100.
 * 100 at the instant the round starts, 50 at the last ms. Guaranteed floor of 50 for any correct guess.
 * now < startedAt (clock skew) clamps to 100. Callers must not score guesses at/after endsAt (not_active).
 */
export const SCORE_FLOOR = 50;
export const SCORE_MAX = 100;
export function calculateScore(startedAt: number, endsAt: number, now: number): number {
	const total = endsAt - startedAt;
	if (total <= 0) return SCORE_FLOOR;
	const fraction = Math.min(1, Math.max(0, (endsAt - now) / total));
	return SCORE_FLOOR + Math.round((SCORE_MAX - SCORE_FLOOR) * fraction);
}

export interface RankInput {
	id: string;
	name: string;
	score: number;
	/** time of correct guess in the latest round, undefined if none */
	lastCorrectAt?: number;
}

/**
 * Sort by score desc, then earlier correct time in latest round (no time sorts last),
 * then name (case insensitive). Returns a new array; does not mutate input.
 * Rank is index + 1.
 */
export function rankPlayers<T extends RankInput>(players: readonly T[]): T[] {
	return [...players].sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		const ta = a.lastCorrectAt ?? Infinity;
		const tb = b.lastCorrectAt ?? Infinity;
		if (ta !== tb) return ta < tb ? -1 : 1;
		return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
	});
}
