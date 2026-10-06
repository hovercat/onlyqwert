# onlyqwert: Specification

onlyqwert is a website offering games a streamer (the **host**) plays together with their community (the **players**). Game 1 is **itspikachu**, a "Who's that Pokémon?" silhouette guessing game, served under `/itspikachu`.

## 1. Tech stack

1. SvelteKit (Svelte 5, runes) with TypeScript, `@sveltejs/adapter-node` (single long lived Node process).
2. Tailwind CSS v4 plus custom CSS files (`src/app.css`, `src/lib/styles/*.css`) for theme tokens, keyframes and effects.
3. Realtime: Server Sent Events (SSE) for server to client pushes, JSON POST/PATCH endpoints for client actions.
4. State: in memory (`Map<code, Room>`) inside the server process. Rooms are lost on restart; this is acceptable.
5. Tests: Vitest (unit and endpoint tests), Playwright (smoke tests at desktop and mobile viewport).
6. Image tooling: `sharp` (dev dependency) to generate silhouette masks at build time.

## 2. Routes

| Route | Purpose |
|---|---|
| `/` | Landing page listing available games (only itspikachu for now, more as "coming soon" cards). |
| `/itspikachu` | Two panels: **Host a room** (name field prefilled "Host", create button) and **Join a room** (code + nickname). |
| `/itspikachu/[code]` | Lobby, game and results for one room. Renders host controls when the request carries a valid host token cookie, otherwise the player view. If the visitor has not joined yet, shows a nickname form first. |

Room codes: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous chars), case insensitive input, uppercase canonical form.

## 3. Domain model

```ts
type Phase = 'lobby' | 'round_active' | 'round_reveal' | 'leaderboard' | 'finished';

interface Settings {
  generations: number[];   // subset of 1..9, at least one
  rounds: number;          // 1..50, default 10
  secondsPerRound: number; // 5..120, default 45
}

interface Player {
  id: string;          // random uuid
  token: string;       // secret, stored in httpOnly cookie `oq_player_<code>`
  name: string;        // 1..20 chars, trimmed, unique per room (case insensitive)
  score: number;
  lastDelta: number;   // points gained last round
  prevRank: number;    // rank before last round (for animation)
  connected: boolean;
}

interface Round {
  index: number;           // 0 based
  pokemonId: number;       // never sent to clients, in any payload
  maskToken: string;       // opaque random id used in mask URL
  spriteToken: string;     // opaque random id used in sprite URL, distinct from maskToken
  startedAt: number;       // epoch ms, server clock
  endsAt: number;
  correct: { playerId: string; points: number; at: number }[]; // in order
}

interface Room {
  code: string;
  hostToken: string;       // httpOnly cookie `oq_host_<code>`
  hostName: string;        // display name when the host plays, validated like player names, default "Host"
  settings: Settings;
  phase: Phase;
  players: Map<string, Player>;
  rounds: Round[];
  usedPokemon: Set<number>;
  createdAt: number;
  lastActivity: number;
}
```

The host is not a player by default. Setting `hostPlays: boolean` (default `true`) lets the streamer also guess; in that case the host gets a Player entry too, named `hostName` (set at room creation, default "Host"; renaming the host player updates `hostName`, so toggling `hostPlays` later reuses it).

## 4. Game flow (state machine)

```
lobby ──start──▶ round_active ──timer end or all correct──▶ round_reveal (4s)
   ▲                                                         │
   │                                                         ▼
   └────────────── (not used) ◀── leaderboard ◀──────────────┘
                                   │ host "next" (or auto after 8s)
                                   ├──▶ round_active (next round)
                                   └──▶ finished (after last round)
```

1. **lobby**: host edits settings, players join. Host clicks Start (requires at least 1 player).
2. **round_active**: server picks a random unused Pokémon from the selected generations, broadcasts the mask URL and `endsAt`. Players type; every keystroke POSTs the whole input value. The round ends when the timer expires or every connected player guessed correctly.
3. **round_reveal**: the colored sprite and name are revealed for 4 seconds.
4. **leaderboard**: scores animate; cards fly up/down to their new rank. Host presses Next (auto advances after 8s if host idle).
5. **finished**: podium for top 3 plus full list. Host can "Play again" (same players, scores reset, back to lobby).

All timers run on the server. Clients render countdowns from `endsAt` with a clock offset measured from the `serverNow` field included in every SSE event.

## 5. Guessing and scoring

1. Normalization (`normalizeName`): Unicode NFKC (fullwidth to halfwidth), locale independent lowercase, `ß` to `ss`, diacritics stripped on Latin letters only (Hangul and kana voicing marks are kept), katakana folded to hiragana, then everything except letters and digits (`\p{L}\p{N}`) removed, including whitespace, punctuation, symbols and middle dots. Examples: `Mr. Mime` → `mrmime`, `Flabébé` → `flabebe`, `Farfetch'd` → `farfetchd`, `Nidoran♀` → `nidoran`, `ピカチュウ` and `ぴかちゅう` are equal.
2. A guess is correct if its normalized form equals the normalized English name or any alias. Aliases hold every localized species name from PokeAPI (de, fr, es, it, ja, ja-Hrkt, roomaji, ko, zh-Hans, zh-Hant, ...) plus `nidoranf`/`nidoranm`. The server precomputes a normalized `Set` per Pokémon and caches it.
3. Score: `points = 50 + Math.round(50 * (endsAt - now) / (endsAt - startedAt))`, range `[50, 100]` (100 at the instant the round starts, 50 at the last ms; `now < startedAt` clamps to 100) for a correct guess during an active round. Guesses at or after `endsAt` score nothing (`not_active`).
4. A player can score at most once per round. After a correct guess, further guesses for that round are ignored (response `{ status: 'already_correct' }`).
5. Guesses outside `round_active`, or arriving after `endsAt` (server clock), are rejected with `{ status: 'not_active' }`.
6. On a correct guess the response also carries the real Pokémon and an authorized sprite URL (see section 6), so the guesser sees it immediately. Wrong guesses return `{ status: 'wrong' }` and are never broadcast (prevents leaking hints).
7. Throttle: max 20 guesses per second per player; excess returns HTTP 429.
8. Ranking: score descending, ties broken by earlier correct time in the latest round, then name.

## 6. HTTP API

All bodies are JSON. Errors are `{ error: string }` with appropriate status. Auth uses httpOnly, `SameSite=Lax` cookies.

| Method & path | Auth | Body | Response |
|---|---|---|---|
| `POST /api/rooms` | none | `{ settings?: Partial<Settings>, hostName?: string }` | `201 { code }`, sets host cookie. 400 invalid `hostName` (same rules as player names) |
| `GET /api/rooms/[code]` | none | | `200 RoomSnapshot` or 404 |
| `POST /api/rooms/[code]/join` | none | `{ name }` | `201 { playerId }`, sets player cookie. 404 unknown room, 409 name taken, 400 invalid name, 409 if phase is `finished` |
| `PATCH /api/rooms/[code]/me` | player (or host who plays) | `{ name }` | `200 { name }`; renames the caller only. 401 no identity, 409 not in lobby or name taken (case insensitive), 400 invalid name |
| `PATCH /api/rooms/[code]/settings` | host | `Partial<Settings>` | `200 { settings }`; 403 not host; 409 if not in lobby; 400 invalid values |
| `POST /api/rooms/[code]/start` | host | | `200`; 409 if not lobby or no players |
| `POST /api/rooms/[code]/next` | host | | `200`; advances leaderboard → next round / finished |
| `POST /api/rooms/[code]/restart` | host | | `200`; finished → lobby, scores reset |
| `POST /api/rooms/[code]/kick` | host | `{ playerId }` | `200` |
| `POST /api/rooms/[code]/guess` | player | `{ value, round }` | `200 { status: 'correct', points, pokemon: { name, generation }, spriteUrl } \| { status: 'wrong' \| 'already_correct' \| 'not_active' }`, 429 throttled |
| `GET /api/rooms/[code]/mask/[maskToken]` | none | | `image/png` silhouette for the current round; 404 otherwise. Response must not reveal the Pokémon id (no redirect, `Cache-Control: no-store`). |
| `GET /api/rooms/[code]/sprite/[spriteToken]` | player or host cookie | | `image/png` colored sprite. Allowed when the round has ended (phase `round_reveal`, `leaderboard`, `finished`) or the requester (player cookie, or host cookie resolving to the host player) already guessed correctly in that round. Otherwise 404, also for unknown or stale tokens (existence is never revealed). `Cache-Control: no-store`, no redirect, no id in headers. |
| `GET /api/rooms/[code]/events` | player or host | | `text/event-stream` |

`RoomSnapshot` contains code, phase, settings, players (`id, name, score, lastDelta, prevRank, rank, connected`; never tokens), current round public info (`index, total, maskUrl, endsAt, correct list with names`), revealed Pokémon (`{ pokemon: { name, generation }, spriteUrl }`) when phase ≥ `round_reveal`, and during `round_active` only for a viewer who already guessed correctly (so a refresh keeps it), never for others, and `you: { playerId?, isHost }`.

## 7. SSE events

Each message: `event: <type>` and `data: JSON` including `serverNow`. On connect the server first sends `snapshot`. Keep alive comment every 15s. Disconnect marks the player `connected: false` after 10s grace.

| Event | Payload |
|---|---|
| `snapshot` | `RoomSnapshot` |
| `player_joined` / `player_left` | `{ player }` / `{ playerId }` |
| `player_renamed` | `{ playerId, name }` (a fresh `snapshot` follows) |
| `settings_updated` | `{ settings }` |
| `round_started` | `{ index, total, maskUrl, startedAt, endsAt }` |
| `player_correct` | `{ playerId, name, points, order }` |
| `round_ended` | `{ pokemon: { name, generation }, spriteUrl }` (no numeric id anywhere) |
| `scoreboard` | `{ players: [{ id, name, score, lastDelta, prevRank, rank }] }` |
| `game_finished` | `{ podium, players }` |
| `room_closed` | `{ reason }` |

## 8. Assets

1. `src/lib/data/pokemon.json`: `[{ id, name, generation, aliases? }]` for national dex 1..1025.
2. `assets/sprites/{id}.png`: colored sprites, NOT under `static/`. Disk names use ids since they are never public. Served only through the sprite endpoint with a per round `spriteToken`, after the round ended or to players who guessed correctly.
3. Masks: `assets/masks/{id}.png` (NOT under `static/`), solid single color silhouette generated from the sprite alpha channel by `scripts/make-masks.ts`. Served only through the mask endpoint so the URL never contains the id.
4. Sprite source: Radical Red style / Gen 3 style front sprites where obtainable, otherwise the PokeAPI sprites repository (`PokeAPI/sprites`). Credits listed in `docs/CREDITS.md`. Sprites are fan content for non commercial use.
5. Sprites are trimmed and scaled with nearest neighbour (`image-rendering: pixelated`) to stay crisp.

## 9. UI and design

1. Look: "hip" dark neon theme. Deep purple/indigo gradient background with subtle animated noise, glassmorphism cards, Pokémon yellow (`#FFCB05`) and electric blue accents, chunky rounded display font (e.g. "Bungee" or "Lilita One" for headings, "Inter" for body via Google Fonts).
2. Mobile first, responsive up to wide desktops. On mobile the guess input is fixed at the bottom above the keyboard, the silhouette fills the top, popups appear as a compact ticker. On desktop: silhouette center, live "got it!" feed on the right, player list on the left.
3. Countdown: large circular ring around the silhouette, turns red under 5s, pulses.
4. Correct guess feed: each `player_correct` pops in one after another (`fly`/`scale` transition with a small stagger queue so bursts stay readable), showing name, order medal and points.
5. Own feedback: input shakes on nothing (no wrong indicator per keystroke); on correct it flashes green, locks, and shows "+87".
6. Reveal: silhouette crossfades into the colored sprite with a flash, name in big type.
7. Leaderboard: cards animated with `animate:flip` (duration ~700ms, elastic easing) moving from previous to new rank; score numbers tween; `lastDelta` badge; arrows showing rank change.
8. Host panel: settings (generation chips 1..9, rounds slider, seconds slider), share code big and copyable plus a join link, start/next/restart buttons, "streamer mode" that hides the room code behind a reveal button.
9. Accessibility: keyboard usable, `prefers-reduced-motion` disables flying animations, color contrast AA.

## 10. Housekeeping and security

1. Rooms idle for 2h are deleted; a sweep runs every 5 min.
2. Max 200 players per room, max 500 rooms total.
3. Nicknames: trimmed, collapsed whitespace, 1..20 chars, HTML escaped by Svelte rendering.
4. Never send the Pokémon id to clients, in any payload. Never send the answer, or the sprite URL, for the active round before `round_ended`, except to a player who already guessed it correctly (their own guess response and snapshots).
5. Tokens are 32 byte random values (`crypto.randomUUID` or `randomBytes`).

## 11. Testing requirements

1. Unit: `normalizeName`, `calculateScore`, ranking, code generator, Pokémon picker (respects generations, no repeats until pool exhausted), state machine transitions.
2. Endpoint tests (import `+server.ts` handlers with mocked `RequestEvent`, or via a test helper), covering at least:
   1. create room (defaults, custom settings, invalid settings, host cookie set);
   2. join room (success, unknown room, duplicate name, invalid name, full room);
   3. settings (host ok, non host 403, invalid 400, not lobby 409);
   4. start / next / restart transitions and permission checks;
   5. guess: correct, wrong, already correct, after timer, before start, wrong round index, throttling, no auth;
   6. score calculation with fake timers (full time ≈ 100, half ≈ 50, last ms ≥ 1);
   7. round auto end when all players correct;
   8. mask endpoint does not expose the id and 404s for stale tokens;
   9. snapshot never contains tokens or the active answer.
3. E2E (Playwright): host creates room, two players join (one at iPhone viewport), play one round, leaderboard shows.
4. `npm run check`, `npm test`, `npm run test:e2e` must pass before any merge.

## 12. Development process

SCRUM style with local git: one branch per story (`feat/<slug>`), PR description in `docs/prs/NNN-<slug>.md` (summary, changes, test plan), reviewed by a reviewer agent, merged into `main` with `git merge --no-ff`. Backlog in `docs/BACKLOG.md`.
