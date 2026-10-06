# PR 206: hate speech filter for nicknames

## Summary
`src/lib/server/nameFilter.ts` (`isOffensiveName`) is called from `validateName`, so it covers joining, the host name on create, and renames. Rejected names get HTTP 400 "That name is not allowed. Please pick another one.", which all name forms already display.

Blocks slurs, racist, antisemitic and Nazi references (including number codes like 1488). Mild profanity is intentionally allowed (e.g. "assinspector67").

Matching folds case, accents and leetspeak, strips separators and collapses repeated letters ("N1gg3r", "k.i.k.e", "H i t l e r"). Short terms that are common inside harmless words ("coon", "spic", "jap", "heil", "ss") only match as whole words, so "Raccoon", "SpicyBoi", "Japan Fan" and "Heiligenschein" pass.

## Test plan
`src/tests/name-filter.test.ts`: 18 allowed names (false positive guard), 26 blocked variants, and API tests for join, create with hostName and rename. `pnpm check` clean, `pnpm test:server` 222 passed.
