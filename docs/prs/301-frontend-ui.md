# PR 301: Frontend UI (stream C)

Branch: `feat/frontend-ui`

## Summary
Complete frontend: theme, landing, itspikachu entry, room page (nickname gate, lobby, host panel, round view, reveal, leaderboard, podium) and an SSE client store.

## Changes
1. Theme: `src/lib/styles/{tokens,keyframes,noise,glass,game}.css`, imported from `src/routes/layout.css`. Neon indigo gradient, animated grain, glass cards, Bungee + Inter (Google Fonts in `app.html`), `prefers-reduced-motion` support.
2. Routes: `/`, `/itspikachu`, `/itspikachu/[code]` (+ `+page.server.ts` loading the snapshot via `fetch('/api/rooms/CODE')`, so no import of `$lib/server`), `+error.svelte`.
3. `src/lib/client/room.svelte.ts`: `RoomStore` ($state) with EventSource, exponential backoff reconnect, clock offset from `serverNow`, staggered feed queue (380 ms), scoreboard/game_finished phase changes held back until the 4 s reveal has been shown.
4. Components: lobby (`NicknameGate`, `PlayerList`, `Lobby`), host (`CodeShare` with streamer mode, `HostPanel` with generation chips, sliders, hostPlays), game (`Ring`, `GuessInput`, `CorrectFeed`, `GameView`), leaderboard (`ScoreCard`, `Leaderboard` with `animate:flip` 700 ms elastic and tweened scores, `Podium`).
5. Mobile: input fixed at bottom, ticker feed, three columns at `lg`.

## Contract assumptions
1. Anti cheat: the frontend never builds sprite URLs from ids and never uses ids. It uses `spriteUrl` from `round_ended` / snapshot `revealed` and from the correct guess response (`{ status:'correct', points, pokemon:{name,generation}, spriteUrl }`), which triggers an immediate personal reveal. All fields are optional in code until `types.ts` is updated (local `CorrectGuessResult` type in `room.svelte.ts`).
2. `scoreboard` event (or `game_finished`) follows `round_ended`; phase switches to leaderboard/finished only after 4 s of reveal on the client.
3. Restart (finished to lobby) is followed by a snapshot (client also refetches the snapshot after POST restart for the host). Players rely on an SSE `snapshot` being pushed.
4. Host with `hostPlays` has `you.playerId` in the snapshot. `prevRank <= 0` is treated as `rank`.
5. Guess POSTs fire on every non composing input event and on compositionend (IME friendly, no maxlength, any language).
6. Imports: routes use `#lib/...` with explicit extensions; files in `src/lib` use relative imports.

## Dependencies
None added. No lockfile changes committed.

## Test plan
1. `pnpm check` and `pnpm build` pass.
2. Smoke tested against the backend branch: `/`, `/itspikachu`, room create, room page 200, unknown room 404.
3. Manual: host + phone viewport (375 px) through a round; verify no horizontal scroll, ring turns red under 5 s, leaderboard animates.

## Review (QA)

Verdict: approved after fixes.

Process: merged current main (incl. PR 202 reveal tokens, PR 203 i18n names) into the branch, ran `pnpm dev --port 5417` and drove a full Playwright flow: host (1440x900) creates a room with 2 rounds, Misty joins at 390x844 (mobile, touch), Brock joins at 1440x900, host starts, Misty tries gen 1 names (throttled, about 15/s) until `status: correct`, round ends, leaderboard, round 2, podium. A desktop reload during round 2 reconnected the SSE stream and restored the round view.

Screenshots checked (host, mobile, desktop for each): entry page, lobby with host panel, round active, right after a correct guess (personal reveal for the guesser, silhouette plus feed popup for others), reveal to leaderboard transition, leaderboard, reload during round 2, final podium.

Findings and fixes:
1. Contract: removed the optional `CorrectGuessResult` shim; it is now `Extract<GuessResponse, { status: 'correct' }>` from `types.ts`. GameView shows `snapshot.revealed ?? personal reveal`, so a viewer who reloads after guessing right mid round still sees the sprite. Verified the guess response carries `pokemon` and a tokenized `/api/rooms/CODE/sprite/TOKEN` URL and that the sprite appears immediately for the guesser only.
2. Visual: the countdown container used class `ring`, which collides with the Tailwind v4 `ring` utility and drew a 1px white square around the stage. Renamed to `cd-ring`.
3. Mobile: the guess placeholder was truncated at 390px; shortened to "Who's that Pokémon?".
4. PO bug "countdown equals seconds / rounds": not reproducible. With rounds=10 and seconds=30 (set via API, via slider events, and via keyboard on the sliders) the server round lasts exactly 30000 ms and both host and mobile player rings start at 30 and tick down 1 per second. Server (`game.ts`), clock offset (`room.svelte.ts`) and `Ring.svelte` contain no division by round count. Added `src/routes/round-timer.e2e.ts` as a regression test (asserts endsAt minus startedAt is 30000 and the ring label reads 30/29 then 25 to 28 after 3 s).

Checks: no horizontal scroll at 390px in any phase, guess input fixed at bottom on mobile, ring turns yellow then red, feed popups appear, leaderboard order correct with rank arrows and gain chips, no console errors, no Pokémon id or `/sprites/` path in client code. `pnpm check` 0 errors, vitest 22 passed, Playwright e2e 2 passed, `pnpm build` ok.

Remaining (non blocking):
1. Buttons do nothing if clicked before hydration (the host button on `/itspikachu` is not a form). Consider a form action fallback.
2. Players whose score did not change but who drop a rank after a reorder show a red down arrow; arguably correct.
