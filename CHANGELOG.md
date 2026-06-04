# Changelog

All notable changes to KeenAI are documented here.

## [Unreleased]

### Added

- KB P0: `keenai/conversation.closed` on conversation close; crystallize `auto_index` FTS indexing; `GET /kb/eval/metrics?includeGolden=true`.
- GA prep: golden eval nightly CI, `pnpm kb:eval`, `pnpm kb:bench`, `docs/DESIGN-CODE-AUDIT.md`.
- CSAT: agent `PATCH` + widget `POST /widget/conversations/:id/rating`; crystallize requires explicit rating (no implicit CSAT 5).
- Import: `keenai import zendesk --kb` writes Help Center JSON to `kb_documents`.
- KB-19 (I108): optional LLM FAQ extract via `KEENAI_CRYSTALLIZE_MODEL` + `OPENAI_API_KEY`.
- Dashboard (I109): `/custom-actions` 4-step wizard stub + `/help-center` KB search UI.
- Release prep (I110): `CHANGELOG.md`, `deploy/helm/README.md` chart plan.

### Changed

- Roadmap / TODO tracker: I104–I108 execution list; Sprint 16 CA-01–06 aligned with code.

### Documentation

- `MIGRATION.md`, `DEPLOYMENT.md`, `GA.md`, worker path notes in `04-MODULES.md` / `06-TECH-STACK.md`.

## [0.0.1] — Alpha

- Core API, Dashboard inbox, Widget, KB Phase A–C scaffolding, Memory Tree stubs.
