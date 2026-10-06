import { LIMITS } from '../types';
import type {
	CorrectEntry,
	PublicPlayer,
	GuessResponse,
	RoomSnapshot,
	ScoreboardPlayer,
	SseData,
	SseEventType
} from '../types';

export interface FeedItem {
	key: string;
	playerId: string;
	name: string;
	points: number;
	order: number;
}

/** Correct guess response (server contract, includes the reveal). */
export type CorrectGuessResult = Extract<GuessResponse, { status: 'correct' }>;

const EVENT_TYPES: SseEventType[] = [
	'snapshot',
	'player_joined',
	'player_left',
	'settings_updated',
	'round_started',
	'player_correct',
	'round_ended',
	'scoreboard',
	'game_finished',
	'room_closed'
];

const STAGGER_MS = 380;

function toFeed(c: Pick<CorrectEntry, 'playerId' | 'name' | 'points' | 'order'>, round: number): FeedItem {
	return { key: `${round}-${c.playerId}`, playerId: c.playerId, name: c.name, points: c.points, order: c.order };
}

/** Reactive client side mirror of a room, fed by SSE. */
export class RoomStore {
	snapshot = $state<RoomSnapshot | null>(null);
	/** serverNow - Date.now(), in ms */
	offset = $state(0);
	status = $state<'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'>('idle');
	closedReason = $state<string | null>(null);
	/** correct guesses revealed in the feed (staggered) */
	feed = $state<FeedItem[]>([]);
	/** all correct guesses of the current round (immediate) */
	correct = $state<FeedItem[]>([]);

	private code = '';
	private es: EventSource | null = null;
	private retry = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	private drainTimer: ReturnType<typeof setTimeout> | undefined;
	private phaseTimer: ReturnType<typeof setTimeout> | undefined;
	private queue: FeedItem[] = [];
	private revealedAt = 0;

	/** server aligned clock */
	now = (): number => Date.now() + this.offset;

	get isHost(): boolean {
		return this.snapshot?.you.isHost ?? false;
	}
	get playerId(): string | undefined {
		return this.snapshot?.you.playerId;
	}
	/** ranked players */
	get players(): PublicPlayer[] {
		return [...(this.snapshot?.players ?? [])].sort((a, b) => a.rank - b.rank);
	}
	get canConnect(): boolean {
		return !!this.snapshot && (this.snapshot.you.isHost || !!this.snapshot.you.playerId);
	}

	init(snapshot: RoomSnapshot): void {
		this.applySnapshot(snapshot);
	}

	connect(code: string): void {
		if (typeof EventSource === 'undefined') return;
		this.code = code;
		this.open();
	}

	disconnect(): void {
		this.status = 'idle';
		this.es?.close();
		this.es = null;
		clearTimeout(this.reconnectTimer);
		clearTimeout(this.drainTimer);
		clearTimeout(this.phaseTimer);
	}

	private open(): void {
		this.es?.close();
		this.status = this.retry > 0 ? 'reconnecting' : 'connecting';
		const es = new EventSource(`/api/rooms/${this.code}/events`);
		this.es = es;
		es.onopen = () => {
			this.status = 'open';
			this.retry = 0;
		};
		es.onerror = () => {
			es.close();
			if (this.status === 'closed' || this.es !== es) return;
			this.status = 'reconnecting';
			const delay = Math.min(1000 * 2 ** this.retry, 8000);
			this.retry += 1;
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = setTimeout(() => this.open(), delay);
		};
		for (const type of EVENT_TYPES) {
			es.addEventListener(type, (e) => {
				try {
					this.handle(type, JSON.parse((e as MessageEvent).data));
				} catch {
					/* ignore malformed event */
				}
			});
		}
	}

	private clock(serverNow: number | undefined): void {
		if (typeof serverNow === 'number') this.offset = serverNow - Date.now();
	}

	private applySnapshot(s: RoomSnapshot): void {
		clearTimeout(this.phaseTimer);
		clearTimeout(this.drainTimer);
		this.queue = [];
		this.snapshot = s;
		this.clock(s.serverNow);
		const idx = s.round?.index ?? 0;
		this.correct = (s.round?.correct ?? []).map((c) => toFeed(c, idx));
		this.feed = [...this.correct];
	}

	private enqueue(item: FeedItem): void {
		this.correct = [...this.correct.filter((c) => c.key !== item.key), item];
		this.queue.push(item);
		if (!this.drainTimer) this.drain();
	}

	private drain(): void {
		const next = this.queue.shift();
		if (!next) {
			this.drainTimer = undefined;
			return;
		}
		this.feed = [...this.feed.filter((f) => f.key !== next.key), next];
		this.drainTimer = setTimeout(() => this.drain(), STAGGER_MS);
	}

	/** Apply a phase change, holding it back until the reveal has been visible long enough. */
	private later(apply: () => void): void {
		clearTimeout(this.phaseTimer);
		if (this.snapshot?.phase === 'round_reveal') {
			const wait = LIMITS.revealMs - (Date.now() - this.revealedAt);
			if (wait > 50) {
				this.phaseTimer = setTimeout(apply, wait);
				return;
			}
		}
		apply();
	}

	private mergeScores(list: ScoreboardPlayer[]): void {
		const s = this.snapshot;
		if (!s) return;
		const byId = new Map(list.map((p) => [p.id, p]));
		s.players = s.players.map((p) => {
			const n = byId.get(p.id);
			return n ? { ...p, ...n } : p;
		});
	}

	private handle(type: SseEventType, data: unknown): void {
		const d = data as { serverNow?: number };
		if (type !== 'snapshot') this.clock(d.serverNow);
		const s = this.snapshot;
		switch (type) {
			case 'snapshot':
				this.applySnapshot(data as RoomSnapshot);
				return;
			case 'room_closed': {
				this.closedReason = (data as SseData<'room_closed'>).reason;
				this.status = 'closed';
				this.es?.close();
				return;
			}
		}
		if (!s) return;
		switch (type) {
			case 'player_joined': {
				const { player } = data as SseData<'player_joined'>;
				const rest = s.players.filter((p) => p.id !== player.id);
				s.players = [...rest, player];
				break;
			}
			case 'player_left': {
				const { playerId } = data as SseData<'player_left'>;
				s.players = s.players.map((p) => (p.id === playerId ? { ...p, connected: false } : p));
				break;
			}
			case 'settings_updated':
				s.settings = (data as SseData<'settings_updated'>).settings;
				break;
			case 'round_started': {
				const r = data as SseData<'round_started'>;
				clearTimeout(this.phaseTimer);
				clearTimeout(this.drainTimer);
				this.drainTimer = undefined;
				this.queue = [];
				this.feed = [];
				this.correct = [];
				s.round = {
					index: r.index,
					total: r.total,
					maskUrl: r.maskUrl,
					startedAt: r.startedAt,
					endsAt: r.endsAt,
					correct: []
				};
				s.revealed = null;
				s.phase = 'round_active';
				break;
			}
			case 'player_correct': {
				const c = data as SseData<'player_correct'>;
				this.enqueue(toFeed(c, s.round?.index ?? 0));
				break;
			}
			case 'round_ended': {
				const r = data as SseData<'round_ended'>;
				this.revealedAt = Date.now();
				s.revealed = { pokemon: r.pokemon, spriteUrl: r.spriteUrl };
				s.phase = 'round_reveal';
				break;
			}
			case 'scoreboard': {
				const { players } = data as SseData<'scoreboard'>;
				this.mergeScores(players);
				this.later(() => {
					if (this.snapshot) this.snapshot.phase = 'leaderboard';
				});
				break;
			}
			case 'game_finished': {
				const { players } = data as SseData<'game_finished'>;
				this.mergeScores(players);
				this.later(() => {
					if (this.snapshot) this.snapshot.phase = 'finished';
				});
				break;
			}
		}
	}
}
