/**
 * Unicode aware name normalization used for guess matching.
 *
 * NFKC (fullwidth to halfwidth), locale independent lowercase, sharp s to ss,
 * Latin diacritics stripped (e to e), katakana folded to hiragana, then everything
 * except letters and digits removed. Hangul and kana voicing marks are preserved.
 */
export function normalizeName(value: string): string {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/(\p{Script=Latin})\p{M}+/gu, '$1')
		.normalize('NFC')
		.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
		.replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Empty strings never match. A single character only matches when it is a whole
 * Hangul syllable or Han ideograph (e.g. Korean Mew 뮤, Cleffa 삐), never a lone Latin
 * letter or kana.
 */
export function isMatchable(v: string): boolean {
	const chars = [...v];
	if (chars.length === 0) return false;
	if (chars.length === 1) return /[\p{Script=Hangul}\p{Script=Han}]/u.test(v);
	return true;
}

/** Normalized set of all accepted spellings for one Pokemon. */
export function buildAcceptedSet(name: string, aliases: readonly string[] = []): Set<string> {
	const set = new Set<string>();
	for (const n of [name, ...aliases]) {
		const v = normalizeName(n);
		if (isMatchable(v)) set.add(v);
	}
	return set;
}

/** True if value matches the name or one of the aliases after normalization. */
export function isCorrectGuess(value: string, name: string, aliases: string[] = []): boolean {
	const v = normalizeName(value);
	if (!isMatchable(v)) return false;
	return buildAcceptedSet(name, aliases).has(v);
}
