# Sideload · TV remote

A phone-friendly React PWA for a separately deployed LAN companion using the Android TV Remote protocol.

This repository contains only the frontend, tests, GitHub Pages workflow and workspace build manifests. The proxy package manifest is retained for lockfile compatibility; proxy implementation is not included. There are no server credentials, pairing certificates, environment files or launcher configuration in this repository.

## Use

Open the GitHub Pages site, then **Settings → Companion address** and enter your companion's HTTPS origin (including its port). The phone must be on the companion's LAN and trust its certificate. Add the site to your home screen after verifying remote control works.

The companion must allow this site's exact origin through CORS and private-network preflight. Pairing and media-server credentials belong on the companion, not in this frontend. This site does not deploy or expose the companion to the internet.

Companion address and UI preferences are stored in the current browser's localStorage. Remote and media API calls go directly to the configured companion; GitHub Pages serves static assets only. Optional voice dictation uses the browser's speech-recognition implementation and may use the browser vendor's online service.

## Development

Requires Node.js 22 and pnpm 10.28.2.

```sh
cd sideload
pnpm install --frozen-lockfile
pnpm --filter @sideload/web dev
pnpm exec vitest run web/test
pnpm --filter @sideload/web build
```

The generic workspace root's proxy commands are not usable in this frontend-only export. Local development proxies `/api` to a companion on `127.0.0.1:8787`, or a companion origin can be configured in Settings.

## Deploy

GitHub Pages is built by `.github/workflows/pages.yml`. Enable **Settings → Pages → Source: GitHub Actions**. The workflow builds for the repository's URL subpath and embeds no deployment credentials.

Do not copy `.env` files, companion state, private launcher source or deployment history into this repository.
