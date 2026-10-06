# PR 202: Anti cheat, reveal tokens and gated sprites

## Summary
Pokémon ids no longer reach clients. Sprites moved out of `static/` and are served through a gated endpoint addressed by a per round `spriteToken`.

## Changes
1. Contracts (first commit): `RevealedPokemon` is `{ name, generation }`; new `Reveal = { pokemon, spriteUrl }`; `RoomSnapshot.revealed` and `round_ended` use `Reveal`; `GuessResponse` correct is `{ status, points, pokemon, spriteUrl }`; server `Round` gains `spriteToken`.
2. `git mv static/sprites assets/sprites`; scripts, CREDITS, BACKLOG and PR 101 doc paths updated.
3. `GET /api/rooms/[code]/sprite/[spriteToken]` (`src/lib/server/sprites.ts`): 200 PNG with `Cache-Control: no-store` when the round ended or the requester already guessed correctly in it; else 404 (also unknown or stale tokens).
4. Snapshots include `revealed` during `round_active` for a viewer who guessed correctly; never for others.
5. `docs/SPEC.md` sections 3, 5, 6, 7, 8, 10 updated.

## Test plan
`src/tests/reveal-tokens.test.ts`: sprite 404 before guess, for other players, anonymous, forged cookie, stale tokens; 200 after own guess (player and host cookie) and after round end; no `id` or `pokemonId` in snapshots, SSE data, guess responses; answer name absent before allowed; `maskToken != spriteToken`; mask token cannot fetch a sprite and vice versa. `pnpm check` and `pnpm exec vitest --run --project server` pass.

## Review (QA)
Verdict: approved, no code changes required.

Checked:
1. No `id`/`pokemonId` in snapshots, SSE (`round_ended` uses `revealOf`), guess responses; `RevealedPokemon` has no id. Join returns `playerId` only.
2. `static/` holds only `robots.txt`; sprites and masks live in `assets/` and the build output contains no `sprites/` paths.
3. Sprite route: unknown token, stale token, wrong viewer, forged cookie and missing file all return the same 404; 200 responses use `Cache-Control: no-store`. Mask and sprite tokens are independent random values.
4. Host as player authorized via `resolvePlayer` (host cookie covered by tests). A refresh during `round_active` keeps the own reveal because `snapshotFor` uses `revealFor`. Previous round tokens only resolve to already ended rounds; restart clears `rounds`, so old tokens 404.
5. Main had not moved (PR 203 and 301 not merged yet), so no merge conflicts or frontend shims to adjust. Follow up for 301/203: frontend must use `spriteUrl` from the server and the correct guess response; guess.ts must keep `...revealOf(room, round)` when alias matching lands.

`pnpm check` 0 errors, `pnpm exec vitest --run --project server` 12/12 pass, `pnpm build` ok.
