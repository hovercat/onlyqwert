/** points = round(100 * (endsAt - now) / (endsAt - startedAt)) clamped to [1, 100]. */
export function calculateScore(startedAt: number, endsAt: number, now: number): number {
	const total = endsAt - startedAt;
	if (total <= 0) return 1;
	const raw = Math.round((100 * (endsAt - now)) / total);
	return Math.min(100, Math.max(1, raw));
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
