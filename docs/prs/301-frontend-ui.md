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
5. Guess POSTs fire on every input event (non empty values only).
6. Imports: routes use `#lib/...` with explicit extensions; files in `src/lib` use relative imports.

## Dependencies
None added. No lockfile changes committed.

## Test plan
1. `pnpm check` and `pnpm build` pass.
2. Smoke tested against the backend branch: `/`, `/itspikachu`, room create, room page 200, unknown room 404.
3. Manual: host + phone viewport (375 px) through a round; verify no horizontal scroll, ring turns red under 5 s, leaderboard animates.
