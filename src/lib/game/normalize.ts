/** Lowercase, NFD, strip diacritics, keep only a-z0-9. */
export function normalizeName(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

/** True if value matches the name or one of the aliases after normalization. */
export function isCorrectGuess(value: string, name: string, aliases: string[] = []): boolean {
	const v = normalizeName(value);
	if (!v) return false;
	return v === normalizeName(name) || aliases.some((a) => normalizeName(a) === v);
}
