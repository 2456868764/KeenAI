#!/usr/bin/env bash
# P1-12: Alpha acceptance smoke — fast gates runnable in CI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== P1-12 Alpha acceptance =="

pnpm verify:p0
pnpm lint
pnpm db:migrate
pnpm exec vitest run apps/api/src/ci-smoke.integration.test.ts
pnpm exec vitest run apps/api/src/email-outbound.integration.test.ts
pnpm exec vitest run apps/api/src/email-imap.integration.test.ts
pnpm exec vitest run apps/api/src/workflow.integration.test.ts
pnpm kb:eval

echo "Alpha acceptance checks passed."
