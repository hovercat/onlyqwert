import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { playerCookieName } from '#lib/types.ts';
import { errorJson, identity, readBody, setAuthCookie, withRoom } from '#lib/server/http.ts';
import { joinRoom, resolvePlayer } from '#lib/server/rooms.ts';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const { room } = g;
	const body = await readBody(request);
	// A visitor who already holds a valid player cookie keeps their identity (page refresh).
	const existing = resolvePlayer(room, { playerToken: identity({ cookies }, room.code).playerToken });
	if (existing) return json({ playerId: existing.id }, { status: 201 });
	const result = joinRoom(room, body.name);
	if (!result.ok) return errorJson(result.status, result.error);
	setAuthCookie(cookies, playerCookieName(room.code), result.value.token);
	return json({ playerId: result.value.id }, { status: 201 });
};
