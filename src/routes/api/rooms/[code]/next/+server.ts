import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { errorJson, withHost } from '../../../../../lib/server/http';
import { nextRound } from '../../../../../lib/server/game';

export const POST: RequestHandler = (event) => {
	const g = withHost(event);
	if ('response' in g) return g.response;
	const result = nextRound(g.room);
	if (!result.ok) return errorJson(result.status, result.error);
	return json({ ok: true });
};
