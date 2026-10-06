# PR 101: Assets, sprites, data and masks (stream A)

## Summary
Adds Pokémon data (national dex 1..1025), front sprites, silhouette masks and the scripts that generate them.

## Changes
- `scripts/build-pokemon-data.ts`: builds `src/lib/data/pokemon.json` from PokeAPI species names (curly apostrophes normalized, generation by id range, Nidoran aliases).
- `scripts/download-sprites.ts`: downloads sprites from PokeAPI/sprites into a fresh temp dir with concurrency 8, validates PNG signature, size and decodability via sharp, then copies to `static/sprites/`. Resumable, `--force` re-downloads.
- `scripts/make-masks.ts`: trims transparent borders of each sprite in place and writes `assets/masks/{id}.png`, a flat `#0b0820` silhouette with the same dimensions (hard alpha edge, no metadata). Idempotent.
- `static/sprites/1..1025.png` (about 4.1 MB), `assets/masks/1..1025.png` (about 4.1 MB, outside `static/`).
- npm scripts: `assets:data`, `assets:download`, `assets:masks`.
- `docs/CREDITS.md`.

## Test plan
- `npm run check` passes.
- `ls static/sprites | wc -l` and `ls assets/masks | wc -l` both give 1025.
- Re running `npm run assets:masks` leaves files unchanged in dimensions.
- Spot check ids 25, 29, 32, 83, 122, 772, 1025 in `pokemon.json`.
- Mask pixels contain only color `11,8,32` (alpha 0 or 255).

## Review
Verdict: **Approved, merged.**

Checked:
- Diff touches only stream A files (scripts, data, sprites, masks, CREDITS, PR doc, npm scripts in package.json).
- 1025 sprites in `static/sprites/`, 1025 masks in `assets/masks/` (outside `static/`).
- All masks contain only `rgb(11,8,32)` with alpha 0 or 255; no color or id leak. A few PNGs carry a harmless DPI chunk only.
- `pokemon.json`: 1025 entries, ids sequential, every generation matches the id ranges. Spot checks OK: Nidoran♀/♂ (with aliases), Farfetch'd, Mr. Mime, Mew (151, gen 1), Chikorita (152, gen 2), Flabébé, Type: Null, Pecharunt (1025, gen 9).
- Scripts only fetch from PokeAPI GitHub raw URLs, validate PNGs, write to fixed project paths. Safe.
- `npm run check`: 0 errors, 0 warnings. No em dashes.

Minor deviations accepted (no action needed): script is `download-sprites.ts` instead of `fetch-sprites.ts`; npm script is `assets:masks` instead of `masks`; sprites are trimmed but not rescaled to a fixed size (frontend should scale with `image-rendering: pixelated`); PokeAPI sprites used instead of Radical Red, documented in CREDITS. Note `Type: Null` has no explicit alias; guess normalization must strip punctuation and spaces.
