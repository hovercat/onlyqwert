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
