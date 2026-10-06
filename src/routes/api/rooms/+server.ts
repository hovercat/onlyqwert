import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hostCookieName, playerCookieName } from '../../../lib/types';
import { createRoom } from '../../../lib/server/rooms';
import { errorJson, readBody, setAuthCookie } from '../../../lib/server/http';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await readBody(request);
	const result = createRoom(body.settings);
	if (!result.ok) return errorJson(result.status, result.error);
	const room = result.value;
	setAuthCookie(cookies, hostCookieName(room.code), room.hostToken);
	const hostPlayer = room.hostPlayerId ? room.players.get(room.hostPlayerId) : undefined;
	if (hostPlayer) setAuthCookie(cookies, playerCookieName(room.code), hostPlayer.token);
	return json({ code: room.code }, { status: 201 });
};
