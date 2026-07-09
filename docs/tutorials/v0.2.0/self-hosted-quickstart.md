# Video Script: Self-hosted Quickstart

## Metadata

- YouTube title: KeenAI v0.2.0 Self-hosted Quickstart
- Bilibili title: KeenAI v0.2.0 自托管快速开始
- Target length: 4-6 min
- Audience: operators evaluating KeenAI locally before a v0.2.0 prerelease deploy

## Key commands

```bash
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm verify:p0
docker compose --profile lite up --build
curl -sS http://localhost:8090/health
```

## Shot list

| Time | Visual | Narration |
|------|--------|-----------|
| 00:00 | `docs/index.md` and `docs/GA.md` | v0.2.0 includes Phase 0 through Phase 3 scope; do not tag until release gates pass. |
| 00:30 | Terminal install command | Install with the repo-pinned package manager path to avoid pnpm version drift. |
| 01:20 | `pnpm verify:p0` output | Verify toolchains, monorepo layout, and lockfiles before starting services. |
| 02:00 | `docker compose --profile lite up --build` | Start the self-hosted lite stack for local validation. |
| 03:20 | API health endpoint | Confirm the API is reachable and healthy. |
| 04:00 | Dashboard browser | Open the dashboard and show Inbox, Help Center, and settings entry points. |
| 05:00 | `docs/V0.2.0-RELEASE-GAP-AUDIT.md` | Close by showing the remaining gates: production proof, published videos, and release ops. |

## Voiceover

KeenAI v0.2.0 is a full Phase 0 through Phase 3 release candidate. This quickstart shows the local self-hosted path used before tagging.

First install dependencies with the repo-pinned pnpm path. Then run the P0 verifier to catch toolchain and workspace layout issues early.

The lite Docker profile starts the API and dashboard with a local database. After the containers are up, call the API health endpoint and open the dashboard.

This validates local startup only. Before a v0.2.0 tag, the release audit still requires remote CI history, production KB evidence, Docker image publish, Helm install proof, and final release links.

## Captions

- `00:00` v0.2.0 = Phase 0-3 release candidate.
- `00:30` Use the pinned package manager path.
- `01:20` P0 checks verify toolchains and repo layout.
- `02:00` Docker lite starts the local stack.
- `03:20` Health checks prove the API is reachable.
- `05:00` Do not tag until all release gates pass.
