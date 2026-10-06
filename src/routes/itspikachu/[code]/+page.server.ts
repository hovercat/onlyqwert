import { error } from '@sveltejs/kit';
import type { RoomSnapshot } from '#lib/types.ts';
import type { PageServerLoad } from './$types';

// Uses the public snapshot endpoint (cookies are forwarded by event.fetch) so this file
// does not depend on stream B's server modules.
export const load: PageServerLoad = async ({ params, fetch }) => {
	const code = params.code.toUpperCase();
	const res = await fetch(`/api/rooms/${code}`);
	if (res.status === 404) error(404, 'Room not found. Check the code and try again.');
	if (!res.ok) error(502, 'Could not load the room.');
	const snapshot = (await res.json()) as RoomSnapshot;
	return { code, snapshot };
};
