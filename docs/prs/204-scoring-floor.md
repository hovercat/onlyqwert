# PR 204: Scoring floor

Branch: feat/scoring-floor

## Change
A correct guess now awards `50 + Math.round(50 * timeLeft / duration)`, range 50..100 (100 at round start, 50 at the last ms). Guesses at or after `endsAt` still get nothing (`not_active`, handled by `submitGuess`). `now < startedAt` (clock skew) clamps to 100. Signature of `calculateScore` is unchanged.

## Files
- `src/lib/game/scoring.ts` (contracts, own commit)
- `docs/SPEC.md` section 5 item 3, `docs/BACKLOG.md` test description
- `src/tests/scoring.test.ts` (new): full = 100, half = 75, last ms = 50, quarter left = 63 (62.5 rounds up), bounds 50..100, monotonic, skew clamp, degenerate duration
- `src/tests/backend-sanity.test.ts`, `src/tests/normalize-i18n.test.ts`: guess at half time now expects 75 instead of 50

## Frontend note
No frontend file was edited. A grep of `src/routes` and `src/lib` found no hard coded scoring text or "100 points" copy in svelte files, so none needs follow up here. Reviewers should still check any UI copy or i18n strings describing the old time based score.

## Verification
`pnpm check` 0 errors; `pnpm exec vitest --run --project server` 29 passed.

## Review
Reviewer/QA: approved.
- `calculateScore` matches the requirement: 50 + round(50 * timeLeft / duration), clamped to 50..100; degenerate duration returns the floor.
- `submitGuess` rejects `at >= endsAt` with `not_active` before scoring, so nothing is awarded at or after the deadline. Points are summed into `score` in `game.ts`; `rankPlayers` tie breaks (score, earlier correct time, name) are unaffected.
- SPEC section 5 item 3 and BACKLOG D1 updated consistently.
- Added (review commit): integration test in `backend-sanity.test.ts` asserting a correct guess at `endsAt - 1` gets 50 and one at exactly `endsAt` is `not_active` with score unchanged.
- Merged main into the branch before merge (already up to date). `pnpm check` 0 errors, server tests 30 passed.
