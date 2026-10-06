import type { ApiError } from '../types';

export interface ApiResult<T> {
	ok: boolean;
	status: number;
	data: (T & Partial<ApiError>) | null;
	error: string | null;
}

/** Small JSON fetch wrapper. Never throws; network failures resolve with ok=false. */
export async function api<T = unknown>(
	method: 'GET' | 'POST' | 'PATCH',
	path: string,
	body?: unknown
): Promise<ApiResult<T>> {
	try {
		const res = await fetch(path, {
			method,
			headers: body === undefined ? undefined : { 'content-type': 'application/json' },
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		let data: (T & Partial<ApiError>) | null = null;
		try {
			data = await res.json();
		} catch {
			data = null;
		}
		return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error ?? `Request failed (${res.status})`) };
	} catch {
		return { ok: false, status: 0, data: null, error: 'Network error, please try again.' };
	}
}

export function normalizeCode(value: string): string {
	return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function prefersReducedMotion(): boolean {
	return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function loadLocal(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function saveLocal(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* storage may be blocked */
	}
}
