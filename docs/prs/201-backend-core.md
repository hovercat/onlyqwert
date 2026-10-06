# 201 Backend core

Branch: `feat/backend-core` (stream B)

## Summary
In memory room store, game state machine with server side timers, guessing and scoring, SSE hub, mask endpoint and all HTTP endpoints from SPEC section 6.

## Changes
- `src/lib/server/`: `clock`, `tokens`, `codes`, `result`, `timers`, `pokemon`, `snapshot`, `sse`, `rooms`, `game`, `guess`, `masks`, `http`.
- `src/routes/api/rooms/**`: create, snapshot, join, settings, start, next, restart, kick, guess, mask, events.
- `src/tests/backend-sanity.test.ts`: quick sanity tests (full suite is stream D).

## Behaviour notes
1. Points are applied to `player.score` when the round ends (not live), so the leaderboard animation has a clear before/after. `lastDelta` is set at round end, `prevRank` at round start.
2. Joined players start `connected: true` and are marked offline after the 10s grace unless the SSE stream opens. Early round end needs at least one connected player, all connected players correct.
3. With `hostPlays`, the host has a Player entry; create/settings set the `oq_player_<code>` cookie, and the host token alone also resolves to the host player.
4. `pokemon.ts` falls back to placeholder entries when `src/lib/data/pokemon.json` is absent.
5. Mask endpoint serves `assets/masks/{id}.png` (1x1 placeholder if missing) for the latest round token only.
6. Routes use relative imports to `src/lib` (no `$lib` alias configured).

## Test plan
`npm run check` and `npx vitest --run --project server` pass.
