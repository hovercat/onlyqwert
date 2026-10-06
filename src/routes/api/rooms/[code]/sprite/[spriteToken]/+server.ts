import type { RequestHandler } from './$types';
import { errorJson, identity, withRoom } from '#lib/server/http.ts';
import { readSprite } from '#lib/server/sprites.ts';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const png = await readSprite(g.room, params.spriteToken, identity({ cookies }, g.room.code));
	if (!png) return errorJson(404, 'Not found');
	return new Response(new Uint8Array(png), {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
	});
};
