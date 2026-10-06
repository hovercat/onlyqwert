import type { Phase, Settings } from '../types';

export interface Player {
	id: string;
	/** secret, httpOnly cookie oq_player_<code> */
	token: string;
	name: string;
	score: number;
	lastDelta: number;
	prevRank: number;
	connected: boolean;
	/** true when this player entry belongs to the host (hostPlays) */
	isHost?: boolean;
}

export interface Round {
	index: number;
	/** never sent to clients before reveal */
	pokemonId: number;
	maskToken: string;
	startedAt: number;
	endsAt: number;
	correct: { playerId: string; points: number; at: number }[];
}

export interface Room {
	code: string;
	/** httpOnly cookie oq_host_<code> */
	hostToken: string;
	hostPlayerId?: string;
	settings: Settings;
	phase: Phase;
	players: Map<string, Player>;
	rounds: Round[];
	usedPokemon: Set<number>;
	createdAt: number;
	lastActivity: number;
}
