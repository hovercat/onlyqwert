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

## Review

Verdict: **Approved with fixes** (merged after main was merged in, real `pokemon.json` and masks in use).

Checked and OK:
1. No leaks before `round_ended`: snapshots expose only `maskUrl` (opaque 24 hex token), `revealed` is null while `round_active`, tokens are never serialized, wrong guesses are never broadcast. The mask endpoint returns PNG bytes directly with `Cache-Control: no-store` and no redirect, and it 404s for stale or unknown tokens.
2. Scoring is computed server side: `calculateScore` clamps to [1, 100]; there is one score per player per round; a wrong round index, a guess at or after `endsAt`, or a guess outside `round_active` returns `not_active`.
3. Every host route goes through `withHost` (403 otherwise). State transitions are guarded (409).
4. Room timers are cleared on next, restart, finish and delete. Cookies are `HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`. The throttle allows 20/s and then returns 429 with `Retry-After`.
5. Design points accepted: points are applied at round end (snapshots already list per-player points in `round.correct`). Players start `connected: true` with a 10s grace period. Early round end is rechecked after a kick and after a grace expiry.

Fixes:
1. `fix: no grace timer for streams closed by kick or room delete`. An SSE abort after `deleteRoom` re-armed `scheduleDisconnect` on the dead room. That could call `checkAllCorrect`, then `endRound`, and start new timers on a deleted room. Regression test added.
2. `refactor: use #lib subpath imports`. SvelteKit 3 removed `$lib`, so `$lib` really fails. `#lib/...` (package.json `imports`) works when it includes the explicit `.ts` extension, so the routes and tests now use `#lib/server/x.ts`.

Verified with `pnpm check` (0 errors), `pnpm exec vitest --run --project server` (6 passed), and a curl smoke test against `pnpm dev`.
