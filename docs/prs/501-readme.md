# PR 501: README

Branch: `docs/readme`

## Summary
Replaces the scaffold README with project documentation.

## Changes
1. `README.md`: pitch, screenshots, features, tech stack, requirements, getting started, asset pipeline, scripts, testing, production run, structure, API overview, process, credits.

## Notes
1. Script names and paths were checked against `package.json` and the repository.
2. `pnpm test:e2e` and the Playwright web server command still call `npm run build`; documented as is.

## Test plan
1. Screenshot links resolve to files in `docs/screenshots/`.
2. No em dashes in the text.

## Review
Reviewer: QA. Verdict: approved after fixes.

1. Ran the documented commands in the worktree after merging main (incl. PR 205 and PR 601): `pnpm install`, `pnpm check` (0 errors, 0 warnings), `pnpm test:server` (41 tests passed), `pnpm build`, `PORT=5488 node build` with `curl /` returning 200.
2. Screenshot links resolve to the four files in `docs/screenshots/`. No em dashes.
3. Fixed leftover npm usages: `test` is now `pnpm test:unit --run && pnpm test:e2e`, Playwright webServer runs `pnpm build && pnpm preview --port 4173`. Added `test:server` (`vitest --run --project server`), `test:unit` stays in watch mode. README updated.
4. README now documents the host name (create with `hostName`, lobby rename via `PATCH /api/rooms/[code]/me`), split streamer mode into its own item, and a Docker section for the Dockerfile and compose.yaml from PR 601.
5. Scoring text (50 floor plus up to 50 for time left, 100 at start) verified against `src/lib/game/scoring.ts`.
