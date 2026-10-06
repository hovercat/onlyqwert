import { DEFAULT_SETTINGS, LIMITS } from '../types';
import type { Settings } from '../types';
import { generateRoomCode, normalizeCode } from './codes';
import { now } from './clock';
import { fail, ok } from './result';
import type { ServiceResult } from './result';
import {
	__resetHub,
	broadcastSnapshots,
	closePlayerConnections,
	closeRoomConnections,
	emit,
	scheduleDisconnect
} from './sse';
import { toPublicPlayer, rankedPlayers } from './snapshot';
import { clearAllTimers, clearRoomTimers } from './timers';
import { newId, newToken } from './tokens';
import type { Player, Room } from './types';

export { isHost, resolvePlayer, snapshotFor } from './snapshot';

const rooms = new Map<string, Room>();
let sweeper: ReturnType<typeof setInterval> | undefined;

// ---------- validation ----------

/** Validates a partial settings object on top of `base`. Returns Settings or an error message. */
export function validateSettings(partial: unknown, base: Settings = DEFAULT_SETTINGS): Settings | string {
	if (partial === undefined || partial === null) return { ...base, generations: [...base.generations] };
	if (typeof partial !== 'object' || Array.isArray(partial)) return 'settings must be an object';
	const p = partial as Record<string, unknown>;
	const out: Settings = { ...base, generations: [...base.generations] };
	if (p.generations !== undefined) {
		const g = p.generations;
		if (!Array.isArray(g) || g.length === 0) return 'generations must be a non empty array';
		if (!g.every((n) => Number.isInteger(n) && n >= 1 && n <= 9)) return 'generations must be integers 1..9';
		out.generations = [...new Set(g as number[])].sort((a, b) => a - b);
	}
	if (p.rounds !== undefined) {
		const r = p.rounds;
		if (!Number.isInteger(r) || (r as number) < LIMITS.roundsMin || (r as number) > LIMITS.roundsMax)
			return `rounds must be an integer ${LIMITS.roundsMin}..${LIMITS.roundsMax}`;
		out.rounds = r as number;
	}
	if (p.secondsPerRound !== undefined) {
		const s = p.secondsPerRound;
		if (!Number.isInteger(s) || (s as number) < LIMITS.secondsMin || (s as number) > LIMITS.secondsMax)
			return `secondsPerRound must be an integer ${LIMITS.secondsMin}..${LIMITS.secondsMax}`;
		out.secondsPerRound = s as number;
	}
	if (p.hostPlays !== undefined) {
		if (typeof p.hostPlays !== 'boolean') return 'hostPlays must be a boolean';
		out.hostPlays = p.hostPlays;
	}
	return out;
}

/** Trim, strip control chars, collapse whitespace; 1..20 chars. Returns name or error message. */
export function validateName(raw: unknown): string | { error: string } {
	if (typeof raw !== 'string') return { error: 'name is required' };
	// eslint-disable-next-line no-control-regex
	const name = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
	const len = [...name].length;
	if (len < LIMITS.nameMin || len > LIMITS.nameMax)
		return { error: `name must be ${LIMITS.nameMin}..${LIMITS.nameMax} characters` };
	return name;
}

function nameTaken(room: Room, name: string, exceptId?: string): boolean {
	const key = name.toLowerCase();
	for (const p of room.players.values()) {
		if (p.id !== exceptId && p.name.toLowerCase() === key) return true;
	}
	return false;
}

// ---------- store ----------

export function getRoom(code: string): Room | undefined {
	return rooms.get(normalizeCode(code));
}

export function roomCount(): number {
	return rooms.size;
}

export function touch(room: Room): void {
	room.lastActivity = now();
}

function newPlayer(room: Room, name: string, isHostPlayer = false): Player {
	return {
		id: newId(),
		token: newToken(),
		name,
		score: 0,
		lastDelta: 0,
		prevRank: room.players.size + 1,
		connected: true,
		...(isHostPlayer ? { isHost: true } : {})
	};
}

/** `settings` is the (untrusted) partial settings object from the request body. */
export function createRoom(settings?: unknown): ServiceResult<Room> {
	if (rooms.size >= LIMITS.maxRooms) return fail(503, 'Too many rooms, try again later');
	const valid = validateSettings(settings);
	if (typeof valid === 'string') return fail(400, valid);
	const t = now();
	const room: Room = {
		code: generateRoomCode((c) => rooms.has(c)),
		hostToken: newToken(),
		settings: valid,
		phase: 'lobby',
		players: new Map(),
		rounds: [],
		usedPokemon: new Set(),
		createdAt: t,
		lastActivity: t
	};
	if (valid.hostPlays) addHostPlayer(room);
	rooms.set(room.code, room);
	startSweeper();
	return ok(room);
}

function addHostPlayer(room: Room): Player {
	let name = 'Host';
	for (let i = 2; nameTaken(room, name); i++) name = `Host ${i}`;
	const p = newPlayer(room, name, true);
	room.players.set(p.id, p);
	room.hostPlayerId = p.id;
	return p;
}

export function joinRoom(room: Room, rawName: unknown): ServiceResult<Player> {
	if (room.phase === 'finished') return fail(409, 'Game is finished');
	const name = validateName(rawName);
	if (typeof name !== 'string') return fail(400, name.error);
	if (room.players.size >= LIMITS.maxPlayersPerRoom) return fail(409, 'Room is full');
	if (nameTaken(room, name)) return fail(409, 'Name already taken');
	const player = newPlayer(room, name);
	room.players.set(player.id, player);
	touch(room);
	// Not connected until the SSE stream opens; mark offline after the grace period otherwise.
	scheduleDisconnect(room, player.id);
	const pub = rankedPlayers(room).find((p) => p.id === player.id)!;
	emit(room, 'player_joined', { player: toPublicPlayer(pub) });
	broadcastSnapshots(room);
	return ok(player);
}

/** Lobby only (caller checks). Applies validated settings; adds/removes the host player. */
export function updateSettings(room: Room, partial: unknown): ServiceResult<Settings> {
	if (room.phase !== 'lobby') return fail(409, 'Settings can only change in the lobby');
	const valid = validateSettings(partial, room.settings);
	if (typeof valid === 'string') return fail(400, valid);
	room.settings = valid;
	if (valid.hostPlays && !room.hostPlayerId) addHostPlayer(room);
	if (!valid.hostPlays && room.hostPlayerId) {
		const id = room.hostPlayerId;
		room.players.delete(id);
		room.hostPlayerId = undefined;
		closePlayerConnections(room, id);
		emit(room, 'player_left', { playerId: id });
	}
	touch(room);
	emit(room, 'settings_updated', { settings: valid });
	broadcastSnapshots(room);
	return ok(valid);
}

/** Removes a player. Returns the removed player or an error. Host player cannot be kicked. */
export function removePlayer(room: Room, playerId: string): ServiceResult<Player> {
	const p = room.players.get(playerId);
	if (!p) return fail(404, 'Unknown player');
	if (p.id === room.hostPlayerId) return fail(400, 'Cannot kick the host');
	room.players.delete(playerId);
	closePlayerConnections(room, playerId);
	touch(room);
	emit(room, 'player_left', { playerId });
	broadcastSnapshots(room);
	return ok(p);
}

export function deleteRoom(room: Room, reason = 'closed'): void {
	closeRoomConnections(room, reason);
	clearRoomTimers(room.code);
	rooms.delete(room.code);
}

/** Deletes rooms idle for longer than LIMITS.roomIdleMs. Returns the number removed. */
export function sweepIdleRooms(at: number = now()): number {
	let n = 0;
	for (const room of [...rooms.values()]) {
		if (at - room.lastActivity > LIMITS.roomIdleMs) {
			deleteRoom(room, 'idle');
			n++;
		}
	}
	return n;
}

function startSweeper(): void {
	if (sweeper) return;
	sweeper = setInterval(() => sweepIdleRooms(), LIMITS.sweepIntervalMs);
	sweeper.unref?.();
}

/** Tests: drop all rooms, timers, connections and the sweeper. */
export function __resetRooms(): void {
	clearAllTimers();
	__resetHub();
	rooms.clear();
	if (sweeper) clearInterval(sweeper);
	sweeper = undefined;
}
