// Blocks hateful nicknames (slurs, racist, antisemitic and Nazi references).
// Mild profanity is intentionally allowed ("assinspector67" is a fine name).
// Matching runs on a "squashed" form: lowercased, accents and leetspeak folded,
// everything except letters removed and repeated letters collapsed, so
// "N1gg3r", "k.i.k.e" and "H i t l e r" are all caught.

const LEET: Record<string, string> = {
	'0': 'o',
	'1': 'i',
	'!': 'i',
	'|': 'i',
	'3': 'e',
	'4': 'a',
	'@': 'a',
	'5': 's',
	$: 's',
	'7': 't',
	'8': 'b',
	'9': 'g',
	'6': 'g'
};

/** Terms blocked anywhere inside the squashed name. */
const SUBSTRING_TERMS = [
	// racial and ethnic slurs
	'nigger',
	'nigga',
	'niglet',
	'kike',
	'kyke',
	'chingchong',
	'raghead',
	'wetback',
	'beaner',
	'kanake',
	'zigeuner',
	'neger',
	'tranny',
	'faggot',
	'retard',
	// antisemitic and Nazi references
	'hitler',
	'nazi',
	'swastika',
	'hakenkreuz',
	'holocaust',
	'auschwitz',
	'gaschamber',
	'gaskammer',
	'gasthejews',
	'killjews',
	'killthejews',
	'judensau',
	'saujude',
	'judenraus',
	'untermensch',
	'siegheil',
	'heilhitler',
	'whitepower',
	'whitepride',
	'rahowa',
	'kukluxklan'
];

/** Terms whose repeated letters matter, checked before collapsing repeats. */
const REPEAT_TERMS = ['kkk'];

/** Short terms that are only blocked as a whole word, to avoid hitting "raccoon", "spicy" or "Japan". */
const WORD_TERMS = ['negro', 'coon', 'spic', 'gook', 'chink', 'jap', 'fag', 'heil', 'ss', 'sa', 'zog'];

/** Hate symbols written as numbers (checked on the digits of the name). */
const NUMBER_CODES = ['1488', '8814'];

function fold(text: string): string {
	return text
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/ß/g, 'ss');
}

function leet(text: string): string {
	return [...text].map((c) => LEET[c] ?? c).join('');
}

function squash(text: string): string {
	return leet(text)
		.replace(/[^a-z]/g, '')
		.replace(/(.)\1+/g, '$1');
}

const SUBSTRINGS = SUBSTRING_TERMS.map(squash);
const WORDS = new Set(WORD_TERMS);

/** True if the nickname contains hateful content and must be rejected. */
export function isOffensiveName(raw: string): boolean {
	const folded = fold(raw);

	const squashed = squash(folded);
	if (SUBSTRINGS.some((term) => squashed.includes(term))) return true;
	const letters = leet(folded).replace(/[^a-z]/g, '');
	if (REPEAT_TERMS.some((term) => letters.includes(term))) return true;

	// Whole words: split on anything that is not a letter (digits stay as separators here,
	// so "jap67" is still the word "jap" while "Japan" is not).
	const words = folded.split(/[^a-z]+/).filter(Boolean);
	if (words.some((w) => WORDS.has(w.replace(/(.)\1+/g, '$1')) || WORDS.has(w))) return true;
	// Also catch spaced out short words like "s p i c".
	if (words.length > 1 && words.every((w) => w.length === 1) && WORDS.has(words.join(''))) return true;

	const digits = folded.replace(/\D/g, '');
	if (NUMBER_CODES.some((code) => digits.includes(code))) return true;

	return false;
}
