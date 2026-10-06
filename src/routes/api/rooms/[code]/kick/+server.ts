import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorJson, readBody, withHost } from '../../../../../lib/server/http';
import { checkAllCorrect } from '../../../../../lib/server/game';
import { removePlayer } from '../../../../../lib/server/rooms';

export const POST: RequestHandler = async (event) => {
	const g = withHost(event);
	if ('response' in g) return g.response;
	const body = await readBody(event.request);
	if (typeof body.playerId !== 'string') return errorJson(400, 'playerId is required');
	const result = removePlayer(g.room, body.playerId);
	if (!result.ok) return errorJson(result.status, result.error);
	checkAllCorrect(g.room);
	return json({ ok: true });
};
