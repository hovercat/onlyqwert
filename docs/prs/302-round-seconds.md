# PR 302: configured seconds per round is the time per Pokemon

## Root cause
The product owner typed 204 s but rounds ran 20 s (the default). The slider/UI had no typed input and no way to see failures:
1. `PATCH /settings` rejects anything outside 5..120 with 400, and the error was shown only faintly, so the server kept the default.
2. HostPanel saved through a 250 ms debounce. Pressing Start before the save landed (or after a failed save) started the round with stale server settings.
3. The `$effect` resyncing `draft` from `settings` could overwrite edits after a failed or racing save.

## Decision
The maximum stays 120 s (product owner). The default is now 45 s (`DEFAULT_SETTINGS.secondsPerRound`).

## Fix
- Number inputs next to the rounds and seconds sliders; typed values clamp to the limits on blur with a visible hint.
- Save errors render in a bordered alert; Start is disabled while saving.
- Start flushes the pending debounced save, awaits any in-flight save, and refuses to start (showing the error) if saving failed. Rapid edits use a revision counter so a late response cannot clear a newer pending edit.
- Room creation already accepts initial settings; the lobby shows server settings and only resyncs when no save is pending.

## Tests
`src/tests/round-seconds.test.ts` (default 45, 120 accepted with 120000 ms round, 121 and 204 rejected) and `src/routes/round-seconds.e2e.ts` (type 90, click Start immediately, round is 90 s; typed 204 clamps to 120 with hint).
- Blur of the number input only saves when it had to correct a value, so clicking Start is never swallowed by a disabled button.

## Review (QA)
Verdict: approved after one fix commit.

Findings and fixes:
- Race in `flush()`: two flushes waiting on the same in-flight save both fired PATCH requests in parallel, so an older draft could land last. Now saves are serialized (`while (inflight) await inflight`).
- Failed save cleared `pending`, so the next SSE `settings_updated` overwrote the host's unsaved edit. `pending` now stays set until a save succeeds; `saving` is cleared so Start can retry, and Start refuses to start while the error is shown.
- The e2e comment wrongly said "204 s round" and now says 90 s.
- Checked: rapid slider drags (debounced, revision counter), typing (only valid values save, blur clamps), Start during debounce (button shows Saving, then flush), SSE during edits (ignored while pending).
- UX: screenshots at 390x844 and 1366x900 show number inputs aligned with sliders, clamped value 120 and the hint visible under Start. No overflow.

Verification: `pnpm check` 0 errors, `pnpm test:server` 45/45, `pnpm build` ok, `round-seconds.e2e.ts` 2/2 (on port 5541).
