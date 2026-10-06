import type { RequestHandler } from './$types';
import { errorJson, identity, withRoom } from '#lib/server/http.ts';
import { isHost, resolvePlayer } from '#lib/server/rooms.ts';
import { subscribe } from '#lib/server/sse.ts';

export const GET: RequestHandler = ({ params, cookies, request }) => {
	const g = withRoom(params.code);
	if ('response' in g) return g.response;
	const { room } = g;
	const viewer = identity({ cookies }, room.code);
	if (!resolvePlayer(room, viewer) && !isHost(room, viewer.hostToken)) {
		return errorJson(401, 'Join the room first');
	}
	const encoder = new TextEncoder();
	let unsubscribe = () => {};
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			unsubscribe = subscribe(
				room,
				viewer,
				(chunk) => controller.enqueue(encoder.encode(chunk)),
				() => {
					try {
						controller.close();
					} catch {
						/* already closed */
					}
				}
			);
			request.signal.addEventListener('abort', () => unsubscribe());
		},
		cancel() {
			unsubscribe();
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
