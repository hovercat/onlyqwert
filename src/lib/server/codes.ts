import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../types';

/** Canonical form: trimmed, uppercase. */
export function normalizeCode(code: string): string {
	return String(code ?? '')
		.trim()
		.toUpperCase();
}

export function isValidCodeFormat(code: string): boolean {
	return (
		code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c))
	);
}

/** Generates a code that `exists` reports as unused. `rng(n)` returns an int in [0, n). */
export function generateRoomCode(
	exists: (code: string) => boolean = () => false,
	rng: (n: number) => number = (n) => randomInt(n)
): string {
	for (let attempt = 0; attempt < 1000; attempt++) {
		let code = '';
		for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[rng(ROOM_CODE_ALPHABET.length)];
		if (!exists(code)) return code;
	}
	throw new Error('Could not generate a unique room code');
}
