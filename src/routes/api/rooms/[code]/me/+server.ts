import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorJson, identity, readBody, withRoom } from '#lib/server/http.ts';
import { renamePlayer, resolvePlayer } from '#lib/server/rooms.ts';

/** Rename the calling player (the host too, when the host plays). Lobby only. */
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const { room } = g;
	const player = resolvePlayer(room, identity({ cookies }, room.code));
	if (!player) return errorJson(401, 'Not a player in this room');
	const body = await readBody(request);
	const result = renamePlayer(room, player, body.name);
	if (!result.ok) return errorJson(result.status, result.error);
	return json({ name: result.value });
};
