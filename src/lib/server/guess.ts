import { buildAcceptedSet, normalizeName } from '../game/normalize';
import { calculateScore } from '../game/scoring';
import { LIMITS } from '../types';
import type { GuessResponse } from '../types';
import { now as clockNow } from './clock';
import { checkAllCorrect, currentRound } from './game';
import { getPokemon } from './pokemon';
import { touch } from './rooms';
import { broadcastSnapshots, emit } from './sse';
import { resolvePlayer, revealOf } from './snapshot';
import type { Player, Room } from './types';

export type GuessOutcome = GuessResponse | { status: 'throttled' } | { status: 'unauthorized' };

const accepted = new WeakMap<object, Set<string>>();

/** Normalized accepted names per Pokemon entry, computed once. */
function acceptedFor(entry: { name: string; aliases?: string[] }): Set<string> {
	let set = accepted.get(entry);
	if (!set) {
		set = buildAcceptedSet(entry.name, entry.aliases);
		accepted.set(entry, set);
	}
	return set;
}

const recent = new WeakMap<Player, number[]>();

/** Sliding window: at most LIMITS.guessesPerSecond within the last 1000 ms. */
function throttled(player: Player, at: number): boolean {
	const list = (recent.get(player) ?? []).filter((t) => at - t < 1000);
	if (list.length >= LIMITS.guessesPerSecond) {
		recent.set(player, list);
		return true;
	}
	list.push(at);
	recent.set(player, list);
	return false;
}

/**
 * Handles one guess. `identity` may carry the player token and/or the host token (host plays).
 * Wrong guesses are never broadcast.
 */
export function submitGuess(
	room: Room,
	identity: string | undefined | { playerToken?: string; hostToken?: string },
	value: unknown,
	roundIndex: unknown,
	at: number = clockNow()
): GuessOutcome {
	const opts = typeof identity === 'object' && identity !== null ? identity : { playerToken: identity };
	const player = resolvePlayer(room, opts);
	if (!player) return { status: 'unauthorized' };
	if (throttled(player, at)) return { status: 'throttled' };
	const round = currentRound(room);
	if (
		room.phase !== 'round_active' ||
		!round ||
		at >= round.endsAt ||
		roundIndex !== round.index ||
		typeof value !== 'string'
	) {
		return { status: 'not_active' };
	}
	if (round.correct.some((c) => c.playerId === player.id)) return { status: 'already_correct' };
	const entry = getPokemon(round.pokemonId);
	if (!entry || !acceptedFor(entry).has(normalizeName(value.slice(0, 100)))) return { status: 'wrong' };
	const points = calculateScore(round.startedAt, round.endsAt, at);
	round.correct.push({ playerId: player.id, points, at });
	touch(room);
	emit(room, 'player_correct', {
		playerId: player.id,
		name: player.name,
		points,
		order: round.correct.length
	});
	broadcastSnapshots(room);
	checkAllCorrect(room);
	return { status: 'correct', points, ...revealOf(room, round)! };
}
