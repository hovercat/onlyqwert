import type { RequestHandler } from './$types';
import { errorJson, withRoom } from '../../../../../../lib/server/http';
import { readMask } from '../../../../../../lib/server/masks';

export const GET: RequestHandler = async ({ params }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const png = await readMask(g.room, params.maskToken);
	if (!png) return errorJson(404, 'Not found');
	return new Response(new Uint8Array(png), {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
	});
};
