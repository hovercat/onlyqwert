# PR 601: Docker image and compose deployment

## Summary
Adds a multi stage Dockerfile (node:22 alpine, pnpm, adapter-node) and a compose.yaml so the app can run on any Docker host behind a reverse proxy.

## Changes
1. `Dockerfile`: build stage installs with the frozen pnpm lockfile, builds, prunes dev deps; runtime stage runs `node build` as the `node` user and ships `assets/` (sprites and masks, read at runtime).
2. `compose.yaml`: one service, binds to `127.0.0.1:${HOST_PORT:-3000}`, `ORIGIN` from env, trusts `X-Forwarded-For` from the proxy.
3. `.dockerignore`.

## Test plan
1. `docker build` and run locally, `GET /itspikachu` returns 200, `POST /api/rooms` returns a code.
2. Deployed to the oracle host (arm64) behind Caddy at onlyqwert.kuhlri.ch.

Note: rooms live in memory, so run exactly one replica.
