import { json } from '@sveltejs/kit';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { hostCookieName, playerCookieName } from '../types';
import { getRoom, isHost } from './rooms';
import type { Room } from './types';

export const errorJson = (status: number, error: string) => json({ error }, { status });

const COOKIE_MAX_AGE = 60 * 60 * 24;
export function setAuthCookie(cookies: Cookies, name: string, value: string): void {
	cookies.set(name, value, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: COOKIE_MAX_AGE
	});
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
	try {
		const b = await request.json();
		return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

export function identity(event: Pick<RequestEvent, 'cookies'>, code: string) {
	return {
		playerToken: event.cookies.get(playerCookieName(code)),
		hostToken: event.cookies.get(hostCookieName(code))
	};
}

type Guarded = { room: Room } | { response: Response };

export function withRoom(code: string | undefined): Guarded {
	const room = getRoom(code ?? '');
	return room ? { room } : { response: errorJson(404, 'Room not found') };
}

export function withHost(event: Pick<RequestEvent, 'cookies' | 'params'>): Guarded {
	const g = withRoom(event.params.code);
	if ('response' in g) return g;
	if (!isHost(g.room, identity(event, g.room.code).hostToken)) {
		return { response: errorJson(403, 'Only the host can do this') };
	}
	return g;
}
