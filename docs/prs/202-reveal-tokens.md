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
