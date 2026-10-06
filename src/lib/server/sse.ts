import { LIMITS } from '../types';
import type { SseData, SseEvent, SseEventType } from '../types';
import { now } from './clock';
import { resolvePlayer, snapshotFor } from './snapshot';
import type { Room } from './types';

export interface Viewer {
	playerToken?: string;
	hostToken?: string;
}

interface Subscriber {
	viewer: Viewer;
	playerId?: string;
	write: (chunk: string) => void;
	close: () => void;
	keepAlive: ReturnType<typeof setInterval>;
}

/** Hooks installed by game/rooms to avoid import cycles. */
export interface HubHooks {
	onPlayerConnected?: (room: Room, playerId: string) => void;
	onPlayerGraceExpired?: (room: Room, playerId: string) => void;
}
const hooks: HubHooks = {};
export function setHubHooks(h: HubHooks): void {
	Object.assign(hooks, h);
}

const subs = new Map<string, Set<Subscriber>>();
const grace = new Map<string, ReturnType<typeof setTimeout>>(); // key: playerId

export function format(event: SseEvent): string {
	return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function safeWrite(s: Subscriber, chunk: string): void {
	try {
		s.write(chunk);
	} catch {
		/* connection gone, cleanup happens via unsubscribe */
	}
}

export function subscriberCount(code: string): number {
	return subs.get(code)?.size ?? 0;
}

function playerHasSubscriber(code: string, playerId: string): boolean {
	for (const s of subs.get(code) ?? []) if (s.playerId === playerId) return true;
	return false;
}

/** Marks a player disconnected after the grace period unless they reconnect. */
export function scheduleDisconnect(room: Room, playerId: string, ms = LIMITS.disconnectGraceMs): void {
	clearTimeout(grace.get(playerId));
	grace.set(
		playerId,
		setTimeout(() => {
			grace.delete(playerId);
			if (playerHasSubscriber(room.code, playerId)) return;
			const p = room.players.get(playerId);
			if (!p || !p.connected) return;
			p.connected = false;
			emit(room, 'player_left', { playerId });
			broadcastSnapshots(room);
			hooks.onPlayerGraceExpired?.(room, playerId);
		}, ms)
	);
}

export function cancelDisconnect(playerId: string): void {
	clearTimeout(grace.get(playerId));
	grace.delete(playerId);
}

/** Registers a connection; sends the snapshot first. Returns an unsubscribe function. */
export function subscribe(
	room: Room,
	viewer: Viewer,
	write: (chunk: string) => void,
	close: () => void
): () => void {
	const player = resolvePlayer(room, viewer);
	const sub: Subscriber = {
		viewer,
		playerId: player?.id,
		write,
		close,
		keepAlive: setInterval(() => safeWrite(sub, ': keepalive\n\n'), LIMITS.keepAliveMs)
	};
	let set = subs.get(room.code);
	if (!set) subs.set(room.code, (set = new Set()));
	set.add(sub);
	safeWrite(sub, format({ type: 'snapshot', data: snapshotFor(room, viewer) }));
	if (player) {
		cancelDisconnect(player.id);
		if (!player.connected) {
			player.connected = true;
			emit(room, 'player_joined', {
				player: snapshotFor(room).players.find((p) => p.id === player.id)!
			});
			broadcastSnapshots(room);
		}
		hooks.onPlayerConnected?.(room, player.id);
	}
	let done = false;
	return () => {
		if (done) return;
		done = true;
		clearInterval(sub.keepAlive);
		subs.get(room.code)?.delete(sub);
		if (sub.playerId && room.players.has(sub.playerId) && !playerHasSubscriber(room.code, sub.playerId)) {
			scheduleDisconnect(room, sub.playerId);
		}
	};
}

/** Broadcasts a non-snapshot event to every subscriber of the room (serverNow added). */
export function emit<K extends Exclude<SseEventType, 'snapshot'>>(
	room: Room,
	type: K,
	data: Omit<SseData<K>, 'serverNow'>
): void {
	const chunk = format({ type, data: { ...data, serverNow: now() } } as unknown as SseEvent);
	for (const s of subs.get(room.code) ?? []) safeWrite(s, chunk);
}

/** Sends every subscriber a fresh snapshot computed for their own viewer identity. */
export function broadcastSnapshots(room: Room): void {
	for (const s of subs.get(room.code) ?? []) {
		safeWrite(s, format({ type: 'snapshot', data: snapshotFor(room, s.viewer) }));
	}
}

/** Closes connections of a removed player. */
export function closePlayerConnections(room: Room, playerId: string): void {
	for (const s of [...(subs.get(room.code) ?? [])]) {
		if (s.playerId === playerId) {
			subs.get(room.code)?.delete(s);
			clearInterval(s.keepAlive);
			try {
				s.close();
			} catch {
				/* ignore */
			}
		}
	}
	cancelDisconnect(playerId);
}

/** Sends room_closed and closes all connections of the room. */
export function closeRoomConnections(room: Room, reason: string): void {
	emit(room, 'room_closed', { reason });
	for (const s of subs.get(room.code) ?? []) {
		clearInterval(s.keepAlive);
		try {
			s.close();
		} catch {
			/* ignore */
		}
	}
	subs.delete(room.code);
	for (const id of room.players.keys()) cancelDisconnect(id);
}

export function __resetHub(): void {
	for (const set of subs.values()) for (const s of set) clearInterval(s.keepAlive);
	subs.clear();
	for (const t of grace.values()) clearTimeout(t);
	grace.clear();
}
