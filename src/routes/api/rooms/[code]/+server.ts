import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { identity, withRoom } from '#lib/server/http.ts';
import { snapshotFor } from '#lib/server/rooms.ts';

export const GET: RequestHandler = ({ params, cookies }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	return json(snapshotFor(g.room, identity({ cookies }, g.room.code)), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
