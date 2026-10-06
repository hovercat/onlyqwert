# 401 Test suite (stream D)

Branch: `feat/test-suite`

## Summary
Comprehensive endpoint, anti cheat, SSE and housekeeping tests that call the real `+server.ts` handlers, plus a full game e2e with a desktop host and a mobile (390x844) player.

## Changes
1. `src/tests/helpers.ts`: cookie `Jar` (records cookie options), `call()` (mock RequestEvent), `Actor` (one browser: create, join, rename, settings, start, next, restart, kick, guess, events, mask, sprite), `openStream` / `parseSse`, `newRoom`, `joined`, `answerOf`.
2. `src/tests/api/`: `create-join`, `lifecycle` (settings, start/next/restart/kick, full game, restart), `guess` (results, throttle, points, early end, ranking, prevRank/lastDelta, podium), `anti-cheat` (mask, sprite, payload hygiene), `sse`, `housekeeping` (idle sweep).
3. `host-name.test.ts` moved onto the helpers; `reveal-tokens.test.ts` folded into `anti-cheat.test.ts` (same cases plus mask and uniform 404 checks). `backend-sanity.test.ts` and the pure unit tests are unchanged.
4. Removed scaffold examples (`src/lib/vitest-examples`, `page.svelte.e2e.ts`).
5. `playwright.config.ts`: webServer `pnpm build && pnpm preview --port 5511 --strictPort`, `baseURL`, one worker. `test:e2e` installs only chromium. New `src/routes/full-game.e2e.ts`.
6. `@vitest/coverage-v8`, `pnpm test:coverage`.

## E2E notes
The answer is secret, so a third API only "scout" player brute forces the gen 1 names (below the throttle) to learn it; the desktop host and the mobile player then type it in the UI. Covers create, join via entry page, start, early round end, reveal, leaderboard on both screens, next, final results with podium, play again, no horizontal scroll at 390px, no page errors.

## Coverage (`pnpm test:coverage`, server code)
Statements 95.8%, branches 94.3%, functions 95.7%, lines 97.3% over `src/lib/server`, `src/lib/game`, `src/routes/api`. 170 server tests.

## Findings
No app bugs found, no app code changed. Observations (not bugs):
1. `Nidoran♀` and `Nidoran♂` normalize identically, so either guess is correct for either one (already documented in PR 203).
2. A player without an open SSE stream is treated as offline after 10s, so early round end tests must open streams like a browser does.
3. Fake timers: `vi.setSystemTime` shifts pending timers too; tests that need a timer to fire advance time instead.

## Test plan
`pnpm check` (0 errors), `pnpm test:server` (170 passed), `pnpm test:e2e` (2 passed).

## Review (QA)
Verdict: approved, merged after `git merge main` (PR 302 and 501), which applied cleanly with no conflicts. The port 5511 / `E2E_PORT` config already serves the PR 302 specs (`round-seconds.e2e.ts`, `round-timer.e2e.ts`) through `baseURL`.

Quality: tests drive the real `+server.ts` handlers and assert bodies, cookies, room state, ranks, deltas and SSE payloads, not just status codes. Time is controlled with fake timers (`useFakeClock`), no real sleeps. State is isolated by `resetWorld()` (`__resetRooms` plus real timers) in `beforeEach`. SPEC section 11 paths are covered: create, join, guesses, scoring 50..100, early end, anti cheat leaks (mask, sprite, payload hygiene), SSE. The e2e scout brute forces gen 1 below the throttle; the full game spec takes about 25s, acceptable.

Results: `pnpm check` 0 errors; `pnpm test:server` 174 passed on 3 consecutive runs (no flakiness); `pnpm test:coverage` statements 95.79%, branches 94.3%, functions 95.68%, lines 97.27%; `pnpm test:e2e` 4 passed (40s). No fixes needed.
