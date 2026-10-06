import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { playerCookieName } from '../../../../../lib/types';
import { errorJson, readBody, setAuthCookie, withHost } from '../../../../../lib/server/http';
import { updateSettings } from '../../../../../lib/server/rooms';

export const PATCH: RequestHandler = async (event) => {
	const g = withHost(event);
	if ('response' in g) return g.response;
	const { room } = g;
	const result = updateSettings(room, await readBody(event.request));
	if (!result.ok) return errorJson(result.status, result.error);
	const hp = room.hostPlayerId ? room.players.get(room.hostPlayerId) : undefined;
	if (hp) setAuthCookie(event.cookies, playerCookieName(room.code), hp.token);
	return json({ settings: result.value });
};
