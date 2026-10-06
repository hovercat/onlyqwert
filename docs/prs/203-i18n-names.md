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
