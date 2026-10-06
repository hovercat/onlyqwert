import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorJson, identity, readBody, withRoom } from '../../../../../lib/server/http';
import { submitGuess } from '../../../../../lib/server/guess';

export const POST: RequestHandler = async ({ params, request, cookies }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const body = await readBody(request);
	const out = submitGuess(g.room, identity({ cookies }, g.room.code), body.value, body.round);
	if (out.status === 'unauthorized') return errorJson(401, 'Join the room first');
	if (out.status === 'throttled') {
		return json({ error: 'Too many guesses' }, { status: 429, headers: { 'Retry-After': '1' } });
	}
	return json(out);
};
