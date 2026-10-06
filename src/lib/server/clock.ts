// Injectable clock seam. Defaults to Date.now() (read lazily, so Vitest fake timers work).
let override: (() => number) | null = null;

export function now(): number {
	return override ? override() : Date.now();
}

/** Tests: replace the clock. Pass null to restore Date.now. */
export function __setClock(fn: (() => number) | null): void {
	override = fn;
}
