// Shared helpers for endpoint tests: a cookie jar, a minimal RequestEvent builder and a tiny
// "browser" abstraction (Actor) that calls the real +server.ts handlers.
import { vi } from 'vitest';
import { hostCookieName, playerCookieName } from '#lib/types.ts';
import type { RoomSnapshot } from '#lib/types.ts';
import { __resetRooms, getRoom } from '#lib/server/rooms.ts';
import { getPokemon } from '#lib/server/pokemon.ts';
import type { Room } from '#lib/server/types.ts';
import { POST as createH } from '../routes/api/rooms/+server.ts';
import { GET as snapshotH } from '../routes/api/rooms/[code]/+server.ts';
import { POST as joinH } from '../routes/api/rooms/[code]/join/+server.ts';
import { PATCH as meH } from '../routes/api/rooms/[code]/me/+server.ts';
import { PATCH as settingsH } from '../routes/api/rooms/[code]/settings/+server.ts';
import { POST as startH } from '../routes/api/rooms/[code]/start/+server.ts';
import { POST as nextH } from '../routes/api/rooms/[code]/next/+server.ts';
import { POST as restartH } from '../routes/api/rooms/[code]/restart/+server.ts';
import { POST as kickH } from '../routes/api/rooms/[code]/kick/+server.ts';
import { POST as guessH } from '../routes/api/rooms/[code]/guess/+server.ts';
import { GET as eventsH } from '../routes/api/rooms/[code]/events/+server.ts';
import { GET as maskH } from '../routes/api/rooms/[code]/mask/[maskToken]/+server.ts';
import { GET as spriteH } from '../routes/api/rooms/[code]/sprite/[spriteToken]/+server.ts';

export interface CookieSet {
	value: string;
	opts: Record<string, unknown>;
}

/** Cookie jar with the subset of the SvelteKit `Cookies` API the handlers use. Records set options. */
export class Jar {
	readonly set_ = new Map<string, CookieSet>();
	constructor(init: Record<string, string> = {}) {
		for (const [k, v] of Object.entries(init)) this.set_.set(k, { value: v, opts: {} });
	}
	get = (name: string) => this.set_.get(name)?.value;
	set = (name: string, value: string, opts: Record<string, unknown> = {}) => {
		this.set_.set(name, { value, opts });
	};
	delete = (name: string) => void this.set_.delete(name);
	opts(name: string) {
		return this.set_.get(name)?.opts;
	}
	names() {
		return [...this.set_.keys()];
	}
}

export interface CallResult<T = any> {
	status: number;
	body: T;
	headers: Headers;
	res: Response;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (event: any) => Response | Promise<Response>;

/** Calls a handler with a mock RequestEvent. `raw` sends a non JSON body as is. */
export async function call(
	handler: Handler,
	opts: {
		jar?: Jar;
		params?: Record<string, string>;
		method?: string;
		body?: unknown;
		raw?: string;
		signal?: AbortSignal;
	} = {}
): Promise<CallResult> {
	const method = opts.method ?? 'POST';
	const hasBody = method !== 'GET';
	const init: RequestInit = { method, signal: opts.signal };
	if (hasBody) init.body = opts.raw ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
	const request = new Request('http://localhost/api', init);
	const res = await handler({
		request,
		params: opts.params ?? {},
		cookies: opts.jar ?? new Jar(),
		url: new URL(request.url)
	});
	let body: unknown = null;
	const ct = res.headers.get('Content-Type') ?? '';
	if (ct.includes('json')) body = await res.json();
	return { status: res.status, body, headers: res.headers, res };
}

/** One browser: its own cookie jar plus convenience calls against a room. */
export class Actor {
	jar: Jar;
	constructor(
		public code = '',
		jar = new Jar()
	) {
		this.jar = jar;
	}
	private p(extra: Record<string, string> = {}) {
		return { code: this.code, ...extra };
	}
	create(body: unknown = {}) {
		return call(createH, { jar: this.jar, body }).then((r) => {
			if (r.status === 201) this.code = r.body.code;
			return r;
		});
	}
	snapshot(code = this.code) {
		return call(snapshotH, { jar: this.jar, method: 'GET', params: { code } });
	}
	join(name: unknown, code = this.code) {
		return call(joinH, { jar: this.jar, params: { code }, body: { name } });
	}
	rename(name: unknown) {
		return call(meH, { jar: this.jar, method: 'PATCH', params: this.p(), body: { name } });
	}
	settings(body: unknown) {
		return call(settingsH, { jar: this.jar, method: 'PATCH', params: this.p(), body });
	}
	start() {
		return call(startH, { jar: this.jar, params: this.p() });
	}
	next() {
		return call(nextH, { jar: this.jar, params: this.p() });
	}
	restart() {
		return call(restartH, { jar: this.jar, params: this.p() });
	}
	kick(playerId: unknown) {
		return call(kickH, { jar: this.jar, params: this.p(), body: { playerId } });
	}
	guess(value: unknown, round: unknown = 0) {
		return call(guessH, { jar: this.jar, params: this.p(), body: { value, round } });
	}
	events(signal?: AbortSignal) {
		return (eventsH as Handler)({
			params: this.p(),
			cookies: this.jar as never,
			request: new Request('http://localhost/api', { signal }),
			url: new URL('http://localhost/api')
		}) as Response | Promise<Response>;
	}
	mask(token: string) {
		return call(maskH, { jar: this.jar, method: 'GET', params: this.p({ maskToken: token }) });
	}
	sprite(token: string) {
		return call(spriteH, { jar: this.jar, method: 'GET', params: this.p({ spriteToken: token }) });
	}
	get room(): Room {
		return getRoom(this.code)!;
	}
	get hasHostCookie() {
		return this.jar.get(hostCookieName(this.code)) !== undefined;
	}
	get playerToken() {
		return this.jar.get(playerCookieName(this.code));
	}
	/** Own player entry of the room (host player or joined player). */
	get me() {
		const t = this.playerToken;
		return [...this.room.players.values()].find((p) => p.token === t);
	}
}

export function useFakeClock(start = 1_000_000) {
	vi.useFakeTimers();
	vi.setSystemTime(start);
}
export function resetWorld() {
	__resetRooms();
	vi.useRealTimers();
}

/** Creates a room (host does not play unless stated) and returns its host actor. */
export async function newRoom(settings: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
	const host = new Actor();
	const r = await host.create({
		settings: { hostPlays: false, rounds: 2, secondsPerRound: 10, ...settings },
		...extra
	});
	if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.body)}`);
	return host;
}

export async function joined(host: Actor, name: string) {
	const a = new Actor(host.code);
	const r = await a.join(name);
	if (r.status !== 201) throw new Error(`join failed ${r.status} ${JSON.stringify(r.body)}`);
	return a;
}

/** Name of the current round's Pokemon (server side peek, tests only). */
export function answerOf(room: Room, roundIdx = room.rounds.length - 1) {
	return getPokemon(room.rounds[roundIdx].pokemonId)!;
}

export type Snap = RoomSnapshot;

/** Parses an SSE text blob into [{event, data}]. */
export function parseSse(text: string): { event: string; data: any }[] {
	const out: { event: string; data: any }[] = [];
	for (const block of text.split('\n\n')) {
		const ev = block.match(/^event: (.+)$/m)?.[1];
		const data = block.match(/^data: (.+)$/m)?.[1];
		if (ev && data) out.push({ event: ev, data: JSON.parse(data) });
	}
	return out;
}

/** Opens the SSE endpoint for an actor and collects text as it arrives. */
export async function openStream(actor: Actor) {
	const ac = new AbortController();
	const res = (await actor.events(ac.signal)) as Response;
	let text = '';
	let closed = false;
	if (res.body) {
		const reader = res.body.getReader();
		const dec = new TextDecoder();
		(async () => {
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					text += dec.decode(value);
				}
			} catch {
				/* aborted */
			}
			closed = true;
		})();
	}
	return {
		res,
		abort: () => ac.abort(),
		text: () => text,
		events: () => parseSse(text),
		isClosed: () => closed,
		// let queued microtasks (stream reads) run
		flush: async () => {
			for (let i = 0; i < 5; i++) await Promise.resolve();
			await vi.advanceTimersByTimeAsync(0);
		}
	};
}
