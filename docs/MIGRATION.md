# Data Migration (Intercom · Zendesk → KeenAI)

> Sprint 18 stub · `bunx keenai import` CLI planned for GA.

## Scope (planned)

| Source | Entities | Status |
|--------|----------|--------|
| Intercom | users, conversations, tags, articles | planned |
| Zendesk | tickets, users, help center articles | planned |

## Recommended flow

1. Export CSV/JSON from source (official export or API).
2. Map to KeenAI tables: `organizations`, `brands`, `conversations`, `messages`, `kb_sources`, `kb_documents`.
3. Run `pnpm db:migrate` on target environment.
4. Import via future CLI:

```bash
# Planned interface (not yet implemented)
bunx keenai import intercom --file ./export.zip --org-slug acme
bunx keenai import zendesk --tickets ./tickets.json --kb ./hc-articles.json
```

## KB articles

Help center HTML/Markdown maps to `kb_sources` + ingest pipeline (KB-16 Inngest). Re-index FTS/vector after bulk import.

## Support

Track progress in [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) · Sprint 18 GA.
