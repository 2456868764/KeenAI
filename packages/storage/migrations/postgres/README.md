# Postgres migrations (dual-dialect bootstrap)

LibSQL migrations live in `migrations/libsql/`. This folder holds Postgres-specific
schema generated via:

```bash
pnpm --filter @keenai/storage db:generate:pg
pnpm --filter @keenai/storage db:push:pg   # dev only
```

Full table parity with LibSQL is tracked in `docs/12-STORAGE-ABSTRACTION.md`.
