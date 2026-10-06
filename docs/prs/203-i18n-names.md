# 203 Localized name guesses

Branch: `feat/i18n-names`

## Summary
Guesses are accepted in every language PokeAPI provides. English stays the display name.

## Changes
- `src/lib/game/normalize.ts` (contracts, own commit): Unicode aware `normalizeName`, new `buildAcceptedSet`.
- `scripts/build-pokemon-data.ts`: emits `aliases` with all localized names, deduplicated after normalization; compact JSON output (about 139 KB).
- `src/lib/data/pokemon.json`: regenerated.
- `src/lib/server/guess.ts`: matching uses a cached normalized Set per Pokémon entry.
- `src/tests/normalize-i18n.test.ts`: de, fr, ja (katakana, hiragana, halfwidth), ko, zh-Hans, zh-Hant, roomaji, fullwidth, umlauts, English regressions, guess level German test.
- SPEC section 5 and CREDITS updated.

## Notes
- Aliases equal to the English name after normalization are dropped, so the explicit `nidoran` alias is covered by the name itself.
- Not touched: snapshot, sse, sprite route, pokemon public types.

## Review

Verdict: approved with one fix.

* normalizeName: NFKC, lowercase, ß to ss, Latin only mark stripping, katakana to hiragana fold (incl. halfwidth via NFKC), punctuation/symbol removal (・, ♀, ♂, apostrophes) all correct. Hangul and kana voicing preserved.
* Collision scan over all 1025 entries (7354 normalized keys): only Nidoran♀/♂ (29/32) share "nidoran", "にどらん", "니드런". Acceptable: only the current round's Pokemon is checked, so it never causes a wrong cross match.
* Empty guesses could never match. Two aliases normalize to one char (뮤 Mew, 삐 Cleffa), which are full Korean names. Fix: new `isMatchable` rejects empty and any single char that is not Hangul/Han, applied to both accepted sets and guesses.
* Performance: accepted sets cached per entry in a WeakMap, guess input capped at 100 chars, O(1) lookup per keystroke. Fine.
* pokemon.json: 139 KB, 1025 entries `{id,name,generation,aliases}`. OK.
* Tests: added dataset wide collision test and empty/single char rejection test.
* `pnpm check` 0 errors, server vitest 15/15 passing.
