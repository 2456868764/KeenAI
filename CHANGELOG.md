# Changelog

All notable changes to KeenAI are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

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
