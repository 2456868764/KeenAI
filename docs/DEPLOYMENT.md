# KeenAI Deployment Guide

> Sprint 18 · self-host and production profiles. See also [ALPHA.md](./ALPHA.md) and [docker-compose.yml](../docker-compose.yml).

## Profiles

| Profile | Command | Includes |
|---------|---------|----------|
| **Lite** | `docker compose --profile lite up --build` | API (Bun) + Dashboard (Next.js) · SQLite volume |
| **Inngest** | add `--profile inngest` | Inngest dev server → workflow/cron |
| **Standard** | `--profile standard` | Postgres (`pgvector`) + Redis + MinIO |
| **Full** | `--profile full` | Standard + future workers |

## Environment (API)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `file:/data/keenai.db` (lite) or Postgres DSN |
| `JWT_SECRET` | yes | ≥ 32 characters in production |
| `APP_URL` | yes | Dashboard origin for links / CORS |
| `PORT` | no | Default `8090` |
| `KEENAI_AUTO_SEED` | no | `1` in Docker lite seeds demo user |
| `INNGEST_EVENT_KEY` | no | Enables Inngest cron instead of in-process scan |
| `WORKFLOW_SCAN_INTERVAL_MINUTES` | no | Default `5`; `0` disables sync scan |
| `OPENAI_API_KEY` | no | Enables copilot + optional KB crystallize LLM extract |
| `KEENAI_CRYSTALLIZE_MODEL` | no | KB-19 FAQ extract model (e.g. `gpt-4o-mini`); needs `OPENAI_API_KEY` |
| `KEENAI_EVAL_JUDGE_MODEL` | no | Optional Mastra/LLM answer scoring in `pnpm kb:eval` |

Copy [.env.example](../.env.example) for local development.

## Docker Lite (recommended alpha)

```bash
docker compose --profile lite up --build -d
# Dashboard http://localhost:3000
# API       http://localhost:8090
# Login     owner@keenai.local / keenai-demo-12
```

Volumes: `keenai-data` (SQLite), `keenai-uploads` (attachments).

## Bun single binary

```bash
pnpm compile:api
# Produces a compiled API binary (see scripts/build-api-binary.sh)
```

Run with the same env vars as the API container. Migrations: `pnpm db:migrate` before first start.

## Vercel + Cloudflare (cloud-shaped)

| Component | Target |
|-----------|--------|
| Dashboard | Vercel · `apps/dashboard` |
| API | Cloudflare Workers / Bun edge **or** single VM with binary |
| DB | Neon Postgres + `pnpm --filter @keenai/storage db:push:pg` |
| Object storage | R2 / S3 |
| Jobs | Inngest Cloud |

Production checklist: JWT rotation, disable `KEENAI_AUTO_SEED`, backups for DB/uploads, OTEL endpoints.

## Health & smoke

```bash
curl -sS http://localhost:8090/health
curl -sS http://localhost:8090/api/v1/health
pnpm smoke
```

## KB eval & performance (Sprint 18)

| Script | Purpose |
|--------|---------|
| `pnpm kb:eval` | Vitest golden retrieval suite + v0.2.0 local release gate (CI nightly) |
| `pnpm kb:release-gate` | Focused Recall@5 + stale-answer proxy gate for v0.2.0 |
| `pnpm kb:bench` | autocannon load test on `/api/v1/kb/search` (requires `pnpm dev`) |

Bench thresholds: `packages/kb/config/kb-perf.yaml` (`p95_ms_max` default 500ms).
Eval thresholds: `packages/kb/config/kb-eval.yaml` (`recall_at_5_min: 0.88`, `stale_answer_rate_max: 0.02`).

## Helm / Kubernetes

Helm chart skeleton exists (`deploy/helm/keenai`); until images publish for v0.2.0, use Docker lite or compose `standard` profile.

## Documentation site

```bash
pnpm dev:docs   # http://localhost:3001 — links to repo docs/ hub
```

## Related

- [index.md](./index.md) — documentation hub
- [MIGRATION.md](./MIGRATION.md) — Intercom / Zendesk import (`pnpm keenai import`)
- [08-ROADMAP.md](./08-ROADMAP.md) — Sprint 18 · v0.2.0 items
- [12-STORAGE-ABSTRACTION.md](./12-STORAGE-ABSTRACTION.md) — Postgres vs SQLite matrix
