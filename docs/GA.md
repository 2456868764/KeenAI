# KeenAI 1.0 GA Checklist

> Sprint 18 · track remaining GA items in [08-ROADMAP.md](./08-ROADMAP.md).  
> Design vs implementation gaps: [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md).

## Engineering

- [x] KB Phase A–C (KB-07～24) — see audit for stub/partial items
- [x] P0 wiring: `keenai/conversation.closed` on close · crystallize `auto_index` FTS · `GET /kb/eval/metrics?includeGolden=true`
- [x] Golden eval suite + nightly CI (`pnpm kb:eval`)
- [x] KB search bench (`pnpm kb:bench`)
- [x] Deployment guide ([DEPLOYMENT.md](./DEPLOYMENT.md))
- [x] `keenai import` CLI stub ([MIGRATION.md](./MIGRATION.md))
- [~] Mastra eval judge (`KEENAI_EVAL_JUDGE_MODEL` + `@mastra/evals` optional)
- [ ] Intercom / Zendesk import (real writes)
- [~] Public documentation site (`pnpm --filter @keenai/docs dev` · MDX/Fumadocs later)
- [ ] Helm chart

## Quality gates

- [ ] Recall@5 ≥ 92% on production golden set
- [ ] Mastra faithfulness ≥ 0.85 on sampled answers
- [ ] P95 KB retrieval < 200ms (see `packages/kb/config/kb-perf.yaml`)
- [ ] Full `pnpm test` + Postgres matrix green on `main`

## Release

- [ ] Security review (JWT, uploads, widget HMAC)
- [ ] CHANGELOG 1.0.0
- [ ] GitHub release + Docker images tagged `1.0.0`
- [ ] Disable `KEENAI_AUTO_SEED` in production compose
