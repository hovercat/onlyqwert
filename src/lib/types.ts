// Shared contracts between backend and frontend. Source of truth: docs/SPEC.md.

export type Phase = 'lobby' | 'round_active' | 'round_reveal' | 'leaderboard' | 'finished';

export interface Settings {
	/** subset of 1..9, at least one */
	generations: number[];
	/** 1..50, default 10 */
	rounds: number;
	/** 5..120, default 20 */
	secondsPerRound: number;
	/** host also plays as a player, default true */
	hostPlays: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
	generations: [1],
	rounds: 10,
	secondsPerRound: 20,
	hostPlays: true
};

export const LIMITS = {
	roundsMin: 1,
	roundsMax: 50,
	secondsMin: 5,
	secondsMax: 120,
	nameMin: 1,
	nameMax: 20,
	maxPlayersPerRoom: 200,
	maxRooms: 500,
	revealMs: 4000,
	leaderboardAutoMs: 8000,
	guessesPerSecond: 20,
	keepAliveMs: 15000,
	disconnectGraceMs: 10000,
	roomIdleMs: 2 * 60 * 60 * 1000,
	sweepIntervalMs: 5 * 60 * 1000
} as const;

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export interface PokemonEntry {
	id: number;
	name: string;
	generation: number;
	aliases?: string[];
}

export interface PublicPlayer {
	id: string;
	name: string;
	score: number;
	lastDelta: number;
	prevRank: number;
	rank: number;
	connected: boolean;
}

export type ScoreboardPlayer = Omit<PublicPlayer, 'connected'>;

export interface CorrectEntry {
	playerId: string;
	name: string;
	points: number;
	/** 1 based order of correct guesses in this round */
	order: number;
	at: number;
}

/** Public Pokemon shape. The numeric id is never sent to clients. */
export interface RevealedPokemon {
	name: string;
	generation: number;
}

/** The real Pokemon plus an opaque, authorized sprite URL (`/api/rooms/{code}/sprite/{spriteToken}`). */
export interface Reveal {
	pokemon: RevealedPokemon;
	spriteUrl: string;
}

export interface PublicRound {
	index: number;
	total: number;
	maskUrl: string;
	startedAt: number;
	endsAt: number;
	correct: CorrectEntry[];
}

export interface RoomSnapshot {
	code: string;
	phase: Phase;
	settings: Settings;
	players: PublicPlayer[];
	/** null in lobby */
	round: PublicRound | null;
	/**
	 * Present when phase is round_reveal, leaderboard or finished, and also during round_active
	 * for a viewer who already guessed correctly this round (never for others).
	 */
	revealed: Reveal | null;
	you: { playerId?: string; isHost: boolean };
	serverNow: number;
}

// SSE events. Every payload carries serverNow.
type WithNow<T> = T & { serverNow: number };

export type SseEvent =
	| { type: 'snapshot'; data: RoomSnapshot }
	| { type: 'player_joined'; data: WithNow<{ player: PublicPlayer }> }
	| { type: 'player_left'; data: WithNow<{ playerId: string }> }
	| { type: 'settings_updated'; data: WithNow<{ settings: Settings }> }
	| {
			type: 'round_started';
			data: WithNow<{ index: number; total: number; maskUrl: string; startedAt: number; endsAt: number }>;
	  }
	| { type: 'player_correct'; data: WithNow<{ playerId: string; name: string; points: number; order: number }> }
	| { type: 'round_ended'; data: WithNow<Reveal> }
	| { type: 'scoreboard'; data: WithNow<{ players: ScoreboardPlayer[] }> }
	| { type: 'game_finished'; data: WithNow<{ podium: ScoreboardPlayer[]; players: ScoreboardPlayer[] }> }
	| { type: 'room_closed'; data: WithNow<{ reason: string }> };

export type SseEventType = SseEvent['type'];
export type SseData<K extends SseEventType> = Extract<SseEvent, { type: K }>['data'];

// API request/response types
export interface ApiError {
	error: string;
}
export interface CreateRoomRequest {
	settings?: Partial<Settings>;
}
export interface CreateRoomResponse {
	code: string;
}
export interface JoinRoomRequest {
	name: string;
}
export interface JoinRoomResponse {
	playerId: string;
}
export type UpdateSettingsRequest = Partial<Settings>;
export interface UpdateSettingsResponse {
	settings: Settings;
}
export interface KickRequest {
	playerId: string;
}
export interface OkResponse {
	ok: true;
}
export interface GuessRequest {
	value: string;
	/** round index the client believes is active */
	round: number;
}
export type GuessStatus = 'correct' | 'wrong' | 'already_correct' | 'not_active';
export type GuessResponse =
	| ({ status: 'correct'; points: number } & Reveal)
	| { status: Exclude<GuessStatus, 'correct'> };

export const hostCookieName = (code: string) => `oq_host_${code}`;
export const playerCookieName = (code: string) => `oq_player_${code}`;
