# onlyqwert Sprint 1 Backlog

Source of truth: `docs/SPEC.md`. Shared contracts already on `main`:

1. `src/lib/types.ts`: Settings (incl. `hostPlays`), Phase, PokemonEntry, PublicPlayer, RoomSnapshot, SseEvent union, API request/response types, GuessStatus, LIMITS, cookie name helpers.
2. `src/lib/server/types.ts`: Room, Player (with token), Round.
3. `src/lib/game/normalize.ts`: `normalizeName`, `isCorrectGuess`.
4. `src/lib/game/scoring.ts`: `calculateScore(startedAt, endsAt, now)`, `rankPlayers`.

These files are FROZEN for the sprint. If a stream needs a change, it opens a separate tiny PR (`feat/contracts-<slug>`) touching only those files, and notifies the other streams. Never edit them inside a stream branch.

## Parallel work rules

1. Each stream works in its own git worktree on branch `feat/<stream>-<slug>`, PR doc in `docs/prs/NNN-<slug>.md` (numbers: A 100s, B 200s, C 300s, D 400s).
2. Only touch files you own (table below). Disjoint ownership means merges are conflict free.
3. `package.json` / `package-lock.json`: only stream A may add `sharp`; stream B adds nothing; stream C may add font packages only if not using Google Fonts. Dependency changes go in their own commit so conflicts are trivial to resolve.
4. Every PR: `npm run check` and `npm run test:unit -- --run` pass.

## File ownership

| Stream | Owns |
|---|---|
| A assets | `assets/sprites/**`, `assets/masks/**`, `src/lib/data/**`, `scripts/**`, `docs/CREDITS.md` |
| B backend | `src/lib/server/**` (except `types.ts`), `src/routes/api/**`, `src/hooks.server.ts` |
| C frontend | `src/routes/+layout.svelte`, `src/routes/+page.svelte`, `src/routes/layout.css`, `src/routes/itspikachu/**`, `src/lib/components/**`, `src/lib/client/**`, `src/lib/styles/**`, `src/app.css`, `src/app.html`, `static/` (except sprites) |
| D tests | `src/tests/**` (Vitest specs), `e2e/**` (Playwright `*.e2e.ts`), `playwright.config.ts`, deletion of `src/lib/vitest-examples/**` and `src/routes/page.svelte.e2e.ts` |

Note: tests that live next to sources are not allowed; all specs go to `src/tests/` (server project picks up `src/**/*.spec.ts`).

## Interface contract between B and C (server module API)

Stream B MUST export these from `src/lib/server/rooms.ts` so C's `+page.server.ts` can use them without waiting:

```ts
export function getRoom(code: string): Room | undefined;           // code is case insensitive
export function snapshotFor(room: Room, opts: { playerToken?: string; hostToken?: string }): RoomSnapshot;
export function isHost(room: Room, hostToken: string | undefined): boolean;
```

Stream B MUST export from `src/lib/server/pokemon.ts`: `getPokemon(id): PokemonEntry | undefined` reading `src/lib/data/pokemon.json`.
Until A merges, B may commit nothing to `src/lib/data/`; instead B's tests (D) use a fixture. A guarantees the JSON shape `PokemonEntry[]`.

Mask URL format: `/api/rooms/{CODE}/mask/{maskToken}`. Sprite URL format: `/api/rooms/{CODE}/sprite/{spriteToken}`.

Client SSE: C connects with `new EventSource('/api/rooms/{code}/events')` and listens per `SseEventType` name; `data` is JSON of `SseData<type>`. Clock offset = `serverNow - Date.now()`.

---

## Stream A: Assets

### A1 Pokemon data
Files: `scripts/build-pokemon-data.ts`, `src/lib/data/pokemon.json`.
Acceptance:
1. JSON array of `PokemonEntry` for national dex 1..1025, English names with proper punctuation (`Mr. Mime`, `Farfetch'd`, `Flabébé`, `Nidoran♀`).
2. `generation` correct per id range (1:1..151, 2:152..251, 3:252..386, 4:387..493, 5:494..649, 6:650..721, 7:722..809, 8:810..905, 9:906..1025).
3. Aliases: Nidoran♀ `['nidoranf','nidoran']`, Nidoran♂ `['nidoranm','nidoran']`; other useful aliases (e.g. `Type: Null` → `typenull`) where normalization alone is insufficient.

### A2 Sprites
Files: `scripts/fetch-sprites.ts`, `assets/sprites/{id}.png`, `docs/CREDITS.md`.
Acceptance:
1. Gen 3 / Radical Red style front sprites where available, fallback `PokeAPI/sprites` repo; one PNG per id 1..1025.
2. Trimmed to content bounds, transparent background, nearest neighbour scaled to a consistent size (e.g. 96 or 192 px max side).
3. Credits documented, non commercial fan content note.

### A3 Masks
Files: `scripts/make-masks.ts`, `assets/masks/{id}.png`, npm script `masks` (in its own commit).
Acceptance:
1. Uses `sharp`; silhouette = alpha channel, single solid color (e.g. `#0b0820` or pure black), same dimensions as sprite.
2. Masks live outside `static/` so they are not publicly addressable by id.
3. Script is idempotent and re runnable.

## Stream B: Backend

### B1 Room store and codes
Files: `src/lib/server/rooms.ts`, `src/lib/server/codes.ts`, `src/lib/server/tokens.ts`.
Acceptance: `generateRoomCode()` with alphabet/length from `types.ts`, unique; `createRoom(settings?)` validates settings (exported `validateSettings(partial): Settings | string`), max 500 rooms; idle sweep (2h, every 5 min) with `room_closed`; `getRoom`, `snapshotFor`, `isHost` per contract; nickname validation (trim, collapse whitespace, 1..20, unique case insensitive), max 200 players; hostPlays creates host Player.

### B2 Game state machine and timers
Files: `src/lib/server/game.ts`, `src/lib/server/pokemon.ts`.
Acceptance: phases per SPEC section 4; `pickPokemon(generations, used, rng?)` with no repeats until pool exhausted; round ends on timer or all connected players correct; reveal 4 s, leaderboard auto next 8 s; restart resets scores; all timers injectable/clearable for tests (export a `now()`/clock seam, use `setTimeout` so Vitest fake timers work); prevRank/lastDelta updated using `rankPlayers`.

### B3 Guessing
Files: `src/lib/server/guess.ts`.
Acceptance: `submitGuess(room, playerToken, value, roundIndex, now)` returns `GuessResponse` or throttled; uses `isCorrectGuess` + `calculateScore`; statuses per SPEC 5; wrong guesses never broadcast; 20 per second throttle.

### B4 SSE hub
Files: `src/lib/server/sse.ts`.
Acceptance: per room subscriber set; `broadcast(room, event: SseEvent)`; snapshot first on connect; keep alive comment every 15 s; disconnect grace 10 s then `player_left`-style `connected:false` + scoreboard update; per connection snapshots computed per viewer.

### B5 API routes
Files: `src/routes/api/rooms/**/+server.ts`, `src/hooks.server.ts` (optional).
Acceptance: every endpoint in SPEC section 6 with exact statuses and bodies; cookies httpOnly, SameSite=Lax, path `/`; mask endpoint streams PNG from `assets/masks` with `Cache-Control: no-store`, 404 for stale token; snapshot never includes tokens or active answer.

## Stream C: Frontend

### C1 Theme and layout
Files: `src/app.css`, `src/lib/styles/*.css`, `src/routes/+layout.svelte`, `src/routes/layout.css`, `src/app.html`.
Acceptance: dark neon theme per SPEC 9 (gradient, animated noise, glass cards, `#FFCB05` + electric blue), Bungee/Lilita One + Inter fonts, `prefers-reduced-motion` respected.

### C2 Landing and itspikachu entry
Files: `src/routes/+page.svelte`, `src/routes/itspikachu/+page.svelte`.
Acceptance: game cards with "coming soon"; host panel (POST `/api/rooms`, then goto room) and join panel (code + nickname, POST join, goto room); errors shown inline.

### C3 Room page shell and SSE client
Files: `src/routes/itspikachu/[code]/+page.server.ts`, `+page.svelte`, `src/lib/client/room.svelte.ts`.
Acceptance: load uses `getRoom`/`snapshotFor` with cookies, 404 if missing; nickname form if not joined; reactive room store fed by SSE with clock offset; reconnect on error.

### C4 Lobby and host panel
Files: `src/lib/components/lobby/**`, `src/lib/components/host/**`.
Acceptance: generation chips 1..9, rounds and seconds sliders (PATCH settings), big copyable code + join link, streamer mode hide code, start/next/restart/kick buttons.

### C5 Game view
Files: `src/lib/components/game/**`.
Acceptance: silhouette with circular countdown ring (red + pulse under 5 s); input POSTs whole value on each input event with current round index; correct: green flash, lock, `+N`; live correct feed with stagger queue (ticker on mobile, right column on desktop); reveal crossfade with flash and big name; pixelated rendering.

### C6 Leaderboard and podium
Files: `src/lib/components/leaderboard/**`.
Acceptance: `animate:flip` ~700 ms elastic, tweened scores, lastDelta badge, rank change arrows; finished view with top 3 podium and full list.

### C7 Mobile layout
Acceptance: input fixed at bottom on mobile, no horizontal scroll at 375 px, desktop three column layout.

## Stream D: Tests

All tests use the contracts above and B's exported functions. Until B merges, D writes against the documented signatures; D rebases after B merges and makes the suite green before its PR is merged.

### D1 Unit tests
Files: `src/tests/unit/*.spec.ts`.
Covers: normalizeName examples, isCorrectGuess incl. aliases, calculateScore (full = 100, half = 75, last ms = 50, quarter left = 63, clamps to 50..100), rankPlayers ties, room code generator, pickPokemon (generations, no repeats until exhausted), state machine transitions with fake timers.

### D2 Endpoint tests
Files: `src/tests/api/*.spec.ts`, `src/tests/helpers/*.ts` (mock `RequestEvent` with cookie jar).
Covers every item of SPEC 11.2 (create, join, settings, start/next/restart, guess cases incl. throttle and wrong round index, auto end when all correct, mask endpoint, snapshot hygiene).

### D3 E2E
Files: `e2e/*.e2e.ts`, `playwright.config.ts`.
Covers: host creates room, two players join (one at iPhone viewport), play one round, leaderboard shows. Remove scaffold example tests.

## Merge order

A and B and C in parallel; D in parallel but merged last. Suggested: A1 then B (needs pokemon.json at runtime) then C then D. Every PR is reviewed by a reviewer agent before `git merge --no-ff`.
