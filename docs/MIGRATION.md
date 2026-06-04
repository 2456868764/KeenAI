# Data Migration (Intercom · Zendesk → KeenAI)

> Sprint 18+ · `pnpm keenai import zendesk --kb` writes Help Center articles to `kb_documents`.

## Scope (planned)

| Source | Entities | Status |
|--------|----------|--------|
| Intercom | users, conversations, tags, articles | planned |
| Zendesk | help center articles → `kb_documents` | **kb import implemented** |
| Zendesk | tickets, users → conversations | planned |

## Recommended flow

1. Export CSV/JSON from source (official export or API).
2. Map to KeenAI tables: `organizations`, `brands`, `conversations`, `messages`, `kb_sources`, `kb_documents`.
3. Run `pnpm db:migrate` on target environment.
4. Import via future CLI:

```bash
# Intercom — plan only (no writes yet)
pnpm keenai import intercom --file ./export.zip --org-slug acme --dry-run

# Zendesk Help Center JSON → kb_documents (requires DATABASE_URL + migrated schema)
export DATABASE_URL=file:./data/keenai.db
pnpm db:migrate
pnpm keenai import zendesk --kb ./hc-articles.json --org-slug acme
pnpm keenai import zendesk --kb ./hc-articles.json --org-slug acme --dry-run
```

## KB articles

Help center HTML/Markdown maps to `kb_sources` + ingest pipeline (KB-16 Inngest). Re-index FTS/vector after bulk import.

## Support

Track progress in [08-ROADMAP-TODO.md](./08-ROADMAP-TODO.md) · Sprint 18 GA.
