import { randomBytes, randomUUID } from 'node:crypto';

/** 32 byte random secret, hex encoded. */
export function newToken(): string {
	return randomBytes(32).toString('hex');
}

export function newId(): string {
	return randomUUID();
}
