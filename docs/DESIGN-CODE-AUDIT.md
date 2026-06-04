# Design ↔ Code Audit (pre–0.1.0 / 1.0 GA)

> Last updated: 2026-05-19 · Sprint 18 GA prep.  
> Roadmap marks many KB/CA items **[x]**; this doc records **implementation depth** vs design docs.

## Summary

| Area | Doc status | Code reality |
|------|------------|--------------|
| KB Phase A–C (KB-07～24) | Done in [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) | Core paths exist; several steps are **stub/heuristic** |
| Custom Actions (CA-01～06) | Done | API + copilot tools + logs + MCP host **stub**; Dashboard wizard UI not built |
| Events | `keenai/conversation.closed` in KB design | **Fixed (P0):** emitted on PATCH close + workflow `close` |
| Crystallize `auto_index` | Index into searchable KB | **Fixed (P0):** `runKbCrystallizeJob` calls `indexDocument` after insert |
| KB-23 metrics | Recall@5 on `/kb/eval/metrics` | **Fixed (P0):** `?includeGolden=true` merges golden eval |
| Help Center | README “Planned” | KB `help_center` connector stub + search; no standalone portal |

## P0 fixes (2026-05-19)

1. **`keenai/conversation.closed`** — `dispatchKbConversationClosed` from `apps/api/src/lib/kb-dispatch.ts` on conversation PATCH → `closed` and workflow engine `close`.
2. **Crystallize indexing** — `apps/api/src/lib/kb-crystallize-pipeline.ts` runs `kb.indexDocument` when gate is `auto_index`.
3. **Metrics merge** — `GET /api/v1/kb/eval/metrics?includeGolden=true` runs `runKbGoldenEval` + `enrichKbEvalMetricsFromGolden`.

## Path drift (docs → code)

| Doc reference | Actual location |
|---------------|-----------------|
| `apps/worker/src/jobs/kb-ingest.ts` | `packages/kb/src/inngest/kb-ingest.ts`, wired via `apps/api/src/lib/kb-inngest.ts` |
| `apps/worker/src/jobs/kb-crystallize.ts` | `packages/kb/src/lifecycle/crystallize.ts`, payload `crystallize-payload.ts`, API `kb-dispatch*.ts` |
| Workflow event `conversation/state.changed.closed` | Separate from KB event; KB uses **`keenai/conversation.closed`** |

## KB items — depth notes

| ID | Marked done | Gap / note |
|----|-------------|------------|
| KB-16 | [x] | Inngest steps exist; not all 8 stages match full production ingest (connectors, retries, notify) |
| KB-18 | [x] | Parsers/chunkers are **stubs** (markdown/hierarchical samples) |
| KG-05 | [x] | `extractKbEntitiesFromDocument` heuristic; graph used in retrieval expand |
| KB-19 | [x] | LLM FAQ extract optional (`KEENAI_CRYSTALLIZE_MODEL`); quality gate still heuristic; CSAT from `conversations.rating` only |
| KB-20 | [x] | Reconcile is **lexical** overlap, not embedding contradiction detector |
| KB-22 | [x] | `assembleUnifiedAgentContext` wired in copilot; **weights in metadata only** (no dynamic re-rank) |
| KB-23 | [x] | Query-log metrics always on; recall/precision need **`includeGolden`** or `POST /kb/eval/run` |

## Non-KB doc mismatches

- **[11-RAG-KNOWLEDGE.md](./11-RAG-KNOWLEDGE.md)** — describes `@mastra/rag`; implementation uses `@keenai/kb` hybrid retriever + optional Mastra **eval** judge only.
- **[04-MODULES.md](./04-MODULES.md) / [06-TECH-STACK.md](./06-TECH-STACK.md)** — still reference `apps/worker` for jobs; worker app may not exist in monorepo layout.
- **Sprint 16 UI bullets** in [08-ROADMAP.md](./08-ROADMAP.md) — superseded by CA-01～06 table; product UI items remain open.

## Doc hygiene (fixed)

- `08-ROADMAP-TODO.md`: KG-05 duplicate `[ ]` vs `[x]` aligned; CA-05/06 mid-doc table aligned with footer.
- `08-ROADMAP.md` Sprint 16: CA-01～06 checkboxes + note for remaining UI/MCP server expose.

## GA blockers (unchanged)

See [GA.md](./GA.md): **0.1.0** uses relaxed dev gates; **1.0** requires Recall@5 ≥ 92%, faithfulness ≥ 0.85, P95 < 200ms, full CI green on production golden set.

## Recommended next work

跟踪 [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) **I104～I110**：

| ID | 项 | 状态 |
|----|-----|------|
| I104 | CSAT `rating` API + widget · crystallize 无隐式默认 CSAT | [x] |
| I105 | `keenai import zendesk --kb` 实写 `kb_documents` | [x] |
| I106 | close → `keenai/conversation.closed` 集成测试 | [x] |
| I107 | `MIGRATION.md` + `04-MODULES` / `06-TECH-STACK` 路径勘误 | [x] |
| I108 | KB-19 LLM FAQ extract（`KEENAI_CRYSTALLIZE_MODEL`） | [x] |
| I109 | Dashboard CA 向导 · Help Center KB search (`/custom-actions`, `/help-center`) | [x] |
| I110 | `CHANGELOG.md` · `deploy/helm/README.md` 规划 | [x] |
| I111 | GitHub Release **`v0.1.0`** | [~] |
| I112+ | 1.0 GA · Docker `1.0.0` · 质量门槛实测 | 待办 |
