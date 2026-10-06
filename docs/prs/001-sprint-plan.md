# PR 001: Sprint plan and shared contracts

## Summary
Adds the sprint backlog split into four parallel streams (assets, backend, frontend, tests) with disjoint file ownership, plus shared TypeScript contracts and pure game helpers every stream depends on.

## Changes
1. `docs/BACKLOG.md`: stories, acceptance criteria, file ownership, B/C server module contract, merge order.
2. `src/lib/types.ts`: Settings (incl. hostPlays), Phase, PokemonEntry, PublicPlayer, RoomSnapshot, SseEvent union with serverNow, API types, GuessStatus, LIMITS, cookie helpers.
3. `src/lib/server/types.ts`: Room, Player, Round (server only).
4. `src/lib/game/normalize.ts`: `normalizeName`, `isCorrectGuess`.
5. `src/lib/game/scoring.ts`: `calculateScore`, `rankPlayers`.

## Test plan
1. `npm run check` passes.
2. Behaviour of helpers is covered by stream D (D1).
