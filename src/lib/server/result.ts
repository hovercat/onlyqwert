export type ServiceResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
export const fail = (status: number, error: string): ServiceResult<never> => ({
	ok: false,
	status,
	error
});
