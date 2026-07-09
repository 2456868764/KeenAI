# Changelog

All notable changes to KeenAI are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

## [0.2.0] — pending

Phase 0 through Phase 3 release candidate. Do not tag until the remaining external acceptance gates in `docs/V0.2.0-RELEASE-GAP-AUDIT.md` are satisfied.

### Added

- Chinese LLM provider support for Qwen and Zhipu, including API env wiring, provider summaries, and Simplified Chinese drafting guidance.
- Dashboard i18n coverage for 12 locales: `en`, `zh`, `ja`, `ko`, `es`, `fr`, `de`, `pt`, `it`, `nl`, `ar`, and `hi`.
- Intercom normalized export import for users/admins, conversations, and messages.
- KB release gate for Recall@5 and stale-answer proxy thresholds, wired into `pnpm kb:eval`.
- `kb:bench:local` for Node-only KB sync/index/search P95 validation without a running API server.
- GHCR Docker publish workflow for `keenai-api` and `keenai-dashboard` `0.2.x` image tags.
- Helm chart defaults for `0.2.0` API and Dashboard images, plus CI lint/template validation.
- CI release evidence artifact generation for v0.2.0 gate summaries.

### Changed

- Root `typecheck` now uses the repo-pinned pnpm path via `corepack pnpm -r --if-present typecheck`.
- Release workflow now marks all `v0.x` GitHub releases as prerelease.
- KB ingest now has an 8-step pipeline with API connector sync, chunk indexing, source status/error updates, notify, and Inngest retries.
- KB parser/chunker, crystallization gates, contradiction detection, and Agent KB/Memory context reranking were deepened for P3-13.
- KB source ingestion now includes config-backed `file`, shallow `web`, GitHub raw content, and Notion page/block sources.

### Verification

- Local CI-equivalent checks: `CI=true corepack pnpm lint`, `CI=true corepack pnpm typecheck`, `CI=true corepack pnpm test`, and `CI=true corepack pnpm kb:eval`.
- Local KB bench: `CI=true corepack pnpm kb:bench:local` (`billing` p95 10.1ms, `refund policy` p95 7.1ms, errors 0).
- Release evidence: `CI=true corepack pnpm release:evidence`.
- Helm validation: `helm lint deploy/helm/keenai`, `helm template keenai deploy/helm/keenai`.

### Remaining Before Tag

- Production Recall@5/stale-answer telemetry or CI artifact from real golden queries.
- Remote CI history and API-level `pnpm kb:bench` P95 from a running service.
- Actual GHCR image publish and Helm install artifact.
- P3-12 tutorial video assets/links and external KPI evidence.

## [0.1.0] — 2026-05-20

First minor release after Alpha (`0.0.1`): KB compounding loop wiring, GA prep, and Dashboard product stubs.

### Added

- KB P0: `keenai/conversation.closed` on conversation close; crystallize `auto_index` FTS indexing; `GET /kb/eval/metrics?includeGolden=true`.
- Golden eval nightly CI, `pnpm kb:eval`, `pnpm kb:bench`, `docs/DESIGN-CODE-AUDIT.md`.
- CSAT: agent `PATCH` + widget `POST /widget/conversations/:id/rating`; crystallize requires explicit rating (no implicit CSAT 5).
- Import: `keenai import zendesk --kb` writes Help Center JSON to `kb_documents`.
- KB-19: optional LLM FAQ extract via `KEENAI_CRYSTALLIZE_MODEL` + `OPENAI_API_KEY`.
- Dashboard: `/custom-actions` 4-step wizard stub + `/help-center` KB search UI.
- `deploy/helm/README.md` chart plan; `keenai import` / Mastra eval judge hooks.

### Changed

- Roadmap / TODO tracker (I104–I110); Sprint 16 CA-01–06 aligned with implementation depth in audit doc.
- Worker job paths in docs → `packages/kb` Inngest + `apps/api` dispatch.

### Documentation

- `MIGRATION.md`, `DEPLOYMENT.md`, `GA.md` (0.1.0 checklist), `docs/releases/v0.1.0.md`.

## [0.0.1] — Alpha

- Core API, Dashboard inbox, Widget, KB Phase A–C scaffolding, Memory Tree stubs.
