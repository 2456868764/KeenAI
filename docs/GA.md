# KeenAI 1.0 GA Checklist

> Sprint 18 · track remaining GA items in [08-ROADMAP.md](./08-ROADMAP.md).  
> Design vs implementation gaps: [DESIGN-CODE-AUDIT.md](./DESIGN-CODE-AUDIT.md).

## Engineering

- [x] KB Phase A–C (KB-07～24) — see audit for stub/partial items
- [x] P0 wiring: `keenai/conversation.closed` on close · crystallize `auto_index` FTS · `GET /kb/eval/metrics?includeGolden=true`
- [x] CSAT rating API + Zendesk HC import (`I104`–`I105`)
- [x] KB-19 LLM FAQ extract (`KEENAI_CRYSTALLIZE_MODEL` + `OPENAI_API_KEY`, `I108`)
- [x] Golden eval suite + nightly CI (`pnpm kb:eval`)
- [x] KB search bench (`pnpm kb:bench`)
- [x] Deployment guide ([DEPLOYMENT.md](./DEPLOYMENT.md))
- [x] `keenai import` CLI stub ([MIGRATION.md](./MIGRATION.md))
- [~] Mastra eval judge (`KEENAI_EVAL_JUDGE_MODEL` + `@mastra/evals` optional)
- [~] Intercom / Zendesk import（Zendesk HC → `kb_documents` 已实现；tickets 待做）
- [~] Public documentation site (`pnpm --filter @keenai/docs dev` · MDX/Fumadocs later)
- [~] Helm chart（`deploy/helm/README.md` 规划 · Chart 待实现）
- [x] Dashboard CA wizard stub + Help Center KB search (`I109`)
- [x] `CHANGELOG.md` unreleased section (`I110`)

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
