import { LIMITS } from '../types';
import { now } from './clock';
import { pickPokemon } from './pokemon';
import { fail, ok } from './result';
import type { ServiceResult } from './result';
import { touch } from './rooms';
import { broadcastSnapshots, emit, setHubHooks } from './sse';
import { rankedPlayers, scoreboardPlayers, revealOf, maskUrl } from './snapshot';
import { clearRoomTimer, setRoomTimer } from './timers';
import { newToken } from './tokens';
import type { Room, Round } from './types';

const SLOT = 'game';

export function currentRound(room: Room): Round | undefined {
	return room.rounds[room.rounds.length - 1];
}

export function startGame(room: Room): ServiceResult<null> {
	if (room.phase !== 'lobby') return fail(409, 'Game already started');
	if (room.players.size < 1) return fail(409, 'Need at least one player');
	room.rounds = [];
	room.usedPokemon.clear();
	for (const p of room.players.values()) {
		p.score = 0;
		p.lastDelta = 0;
	}
	touch(room);
	startRound(room);
	return ok(null);
}

function startRound(room: Room): void {
	for (const p of rankedPlayers(room)) {
		const real = room.players.get(p.id)!;
		real.prevRank = p.rank;
		real.lastDelta = 0;
	}
	const entry = pickPokemon(room.settings.generations, room.usedPokemon);
	if (!entry) {
		console.error('[onlyqwert] no pokemon for generations', room.settings.generations);
		return finish(room);
	}
	room.usedPokemon.add(entry.id);
	const startedAt = now();
	const ms = room.settings.secondsPerRound * 1000;
	const round: Round = {
		index: room.rounds.length,
		pokemonId: entry.id,
		maskToken: newToken().slice(0, 24),
		spriteToken: newToken().slice(0, 24),
		startedAt,
		endsAt: startedAt + ms,
		correct: []
	};
	room.rounds.push(round);
	room.phase = 'round_active';
	touch(room);
	emit(room, 'round_started', {
		index: round.index,
		total: room.settings.rounds,
		maskUrl: maskUrl(room.code, round.maskToken),
		startedAt: round.startedAt,
		endsAt: round.endsAt
	});
	broadcastSnapshots(room);
	setRoomTimer(room.code, SLOT, ms, () => endRound(room));
}

/** Ends the active round (timer, or everyone correct): applies points, reveals the Pokemon. */
export function endRound(room: Room): void {
	if (room.phase !== 'round_active') return;
	const round = currentRound(room);
	if (!round) return;
	for (const c of round.correct) {
		const p = room.players.get(c.playerId);
		if (p) {
			p.score += c.points;
			p.lastDelta = c.points;
		}
	}
	room.phase = 'round_reveal';
	touch(room);
	emit(room, 'round_ended', revealOf(room, round)!);
	broadcastSnapshots(room);
	setRoomTimer(room.code, SLOT, LIMITS.revealMs, () => toLeaderboard(room));
}

function toLeaderboard(room: Room): void {
	if (room.phase !== 'round_reveal') return;
	room.phase = 'leaderboard';
	emit(room, 'scoreboard', { players: scoreboardPlayers(room) });
	broadcastSnapshots(room);
	setRoomTimer(room.code, SLOT, LIMITS.leaderboardAutoMs, () => advance(room));
}

function advance(room: Room): void {
	if (room.phase !== 'leaderboard') return;
	if (room.rounds.length >= room.settings.rounds) finish(room);
	else startRound(room);
}

function finish(room: Room): void {
	clearRoomTimer(room.code, SLOT);
	room.phase = 'finished';
	touch(room);
	const players = scoreboardPlayers(room);
	emit(room, 'game_finished', { podium: players.slice(0, 3), players });
	broadcastSnapshots(room);
}

/** Host "next": leaderboard to next round or finished. */
export function nextRound(room: Room): ServiceResult<null> {
	if (room.phase !== 'leaderboard') return fail(409, 'Not on the leaderboard');
	clearRoomTimer(room.code, SLOT);
	advance(room);
	return ok(null);
}

/** Host "play again": finished to lobby with scores reset. */
export function restartGame(room: Room): ServiceResult<null> {
	if (room.phase !== 'finished') return fail(409, 'Game is not finished');
	clearRoomTimer(room.code, SLOT);
	room.phase = 'lobby';
	room.rounds = [];
	room.usedPokemon.clear();
	let i = 1;
	for (const p of rankedPlayers(room)) {
		const real = room.players.get(p.id)!;
		real.score = 0;
		real.lastDelta = 0;
		real.prevRank = i++;
	}
	touch(room);
	broadcastSnapshots(room);
	return ok(null);
}

/** Ends the round early when at least one player is connected and all connected players are correct. */
export function checkAllCorrect(room: Room): void {
	if (room.phase !== 'round_active') return;
	const round = currentRound(room);
	if (!round) return;
	const done = new Set(round.correct.map((c) => c.playerId));
	let connected = 0;
	for (const p of room.players.values()) {
		if (!p.connected) continue;
		connected++;
		if (!done.has(p.id)) return;
	}
	if (connected > 0) endRound(room);
}

setHubHooks({ onPlayerGraceExpired: (room) => checkAllCorrect(room) });
