import { rankPlayers } from '../game/scoring';
import type { PublicPlayer, Reveal, RoomSnapshot, ScoreboardPlayer } from '../types';
import { now } from './clock';
import { getPokemon } from './pokemon';
import type { Player, Room, Round } from './types';

export function maskUrl(code: string, maskToken: string): string {
	return `/api/rooms/${code}/mask/${maskToken}`;
}

export function spriteUrl(code: string, spriteToken: string): string {
	return `/api/rooms/${code}/sprite/${spriteToken}`;
}

/** True once the round's answer may be shown to everyone. */
export function roundEnded(room: Room, round: Round): boolean {
	if (round !== room.rounds[room.rounds.length - 1]) return true;
	return room.phase !== 'lobby' && room.phase !== 'round_active';
}

/** The public reveal (name, generation, sprite URL) for a round. Callers must have checked authorization. */
export function revealOf(room: Room, round: Round): Reveal | null {
	const entry = getPokemon(round.pokemonId);
	if (!entry) return null;
	return {
		pokemon: { name: entry.name, generation: entry.generation },
		spriteUrl: spriteUrl(room.code, round.spriteToken)
	};
}

/** Reveal for a viewer: everyone after the round ended, only correct guessers before. */
export function revealFor(room: Room, round: Round, player: Player | undefined): Reveal | null {
	if (roundEnded(room, round) || (player && round.correct.some((c) => c.playerId === player.id))) {
		return revealOf(room, round);
	}
	return null;
}

export function isHost(room: Room, hostToken: string | undefined): boolean {
	return !!hostToken && hostToken === room.hostToken;
}

/** Finds the acting player: by player token, or by host token when the host also plays. */
export function resolvePlayer(
	room: Room,
	opts: { playerToken?: string; hostToken?: string }
): Player | undefined {
	if (opts.playerToken) {
		for (const p of room.players.values()) if (p.token === opts.playerToken) return p;
	}
	if (isHost(room, opts.hostToken) && room.hostPlayerId) return room.players.get(room.hostPlayerId);
	return undefined;
}

/** Players sorted by rank (score, earlier correct in latest round, name). Does not mutate. */
export function rankedPlayers(room: Room): (Player & { rank: number })[] {
	const latest = room.rounds[room.rounds.length - 1];
	const at = new Map(latest?.correct.map((c) => [c.playerId, c.at]));
	const input = [...room.players.values()].map((p) => ({ ...p, lastCorrectAt: at.get(p.id) }));
	return rankPlayers(input).map((p, i) => {
		const { lastCorrectAt: _ignored, ...rest } = p;
		void _ignored;
		return { ...rest, rank: i + 1 };
	});
}

export function toPublicPlayer(p: Player & { rank: number }): PublicPlayer {
	return {
		id: p.id,
		name: p.name,
		score: p.score,
		lastDelta: p.lastDelta,
		prevRank: p.prevRank,
		rank: p.rank,
		connected: p.connected
	};
}

export function scoreboardPlayers(room: Room): ScoreboardPlayer[] {
	return rankedPlayers(room).map((p) => ({
		id: p.id,
		name: p.name,
		score: p.score,
		lastDelta: p.lastDelta,
		prevRank: p.prevRank,
		rank: p.rank
	}));
}

/** Never contains tokens, and never contains the answer before the round has ended. */
export function snapshotFor(
	room: Room,
	opts: { playerToken?: string; hostToken?: string } = {}
): RoomSnapshot {
	const ranked = rankedPlayers(room);
	const latest = room.rounds[room.rounds.length - 1];
	const showRound = room.phase !== 'lobby' && latest;
	const names = new Map(ranked.map((p) => [p.id, p.name]));
	const you = resolvePlayer(room, opts);
	const revealed = showRound ? revealFor(room, latest, you) : null;
	return {
		code: room.code,
		phase: room.phase,
		settings: { ...room.settings, generations: [...room.settings.generations] },
		players: ranked.map(toPublicPlayer),
		round: showRound
			? {
					index: latest.index,
					total: room.settings.rounds,
					maskUrl: maskUrl(room.code, latest.maskToken),
					startedAt: latest.startedAt,
					endsAt: latest.endsAt,
					correct: latest.correct.map((c, i) => ({
						playerId: c.playerId,
						name: names.get(c.playerId) ?? '',
						points: c.points,
						order: i + 1,
						at: c.at
					}))
				}
			: null,
		revealed,
		you: { playerId: you?.id, isHost: isHost(room, opts.hostToken) },
		serverNow: now()
	};
}
