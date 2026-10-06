# PR 701: env driven site copy, footer, smoother guess input

## Summary
1. Landing page title, tagline and footer links come from environment variables (`SITE_HERO_TITLE`, `SITE_HERO_TAGLINE`, `SITE_FOOTER_LINKS`), read in `src/routes/+layout.server.ts`. Deployment specific text lives only in the server `.env`, never in git. Neutral defaults otherwise; the footer only renders when links are set. Only http(s) links are accepted.
2. Removed the "race your chat" style copy and the chat oriented page title.
3. Guess input: at most one guess request in flight. Keystrokes during a request only mark the newest value as pending, so typing never waits on the network, the server always gets the latest text, duplicates are skipped, and a 429 backs off briefly instead of piling up.

## Test plan
1. `pnpm check`: 0 errors. `pnpm test:server`: 174 passed. `pnpm test:e2e`: 4 passed (full game guessing still works).
2. Built and ran `node build` with and without the SITE_* variables: custom title, tagline and both footer links render; defaults render without a footer.
