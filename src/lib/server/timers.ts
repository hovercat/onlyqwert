// Per room timer registry so rooms can be torn down cleanly. Uses setTimeout (fake timer friendly).
const timers = new Map<string, Map<string, ReturnType<typeof setTimeout>>>();

export function setRoomTimer(code: string, slot: string, ms: number, fn: () => void): void {
	clearRoomTimer(code, slot);
	let slots = timers.get(code);
	if (!slots) timers.set(code, (slots = new Map()));
	slots.set(
		slot,
		setTimeout(() => {
			timers.get(code)?.delete(slot);
			try {
				fn();
			} catch (e) {
				console.error('[onlyqwert] timer error', e);
			}
		}, ms)
	);
}

export function clearRoomTimer(code: string, slot: string): void {
	const t = timers.get(code)?.get(slot);
	if (t) clearTimeout(t);
	timers.get(code)?.delete(slot);
}

export function clearRoomTimers(code: string): void {
	for (const t of timers.get(code)?.values() ?? []) clearTimeout(t);
	timers.delete(code);
}

export function clearAllTimers(): void {
	for (const code of [...timers.keys()]) clearRoomTimers(code);
}
