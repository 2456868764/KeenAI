#!/usr/bin/env bash
# P2-19: Beta acceptance — unit/integration + alpha smoke + Playwright e2e.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== P2-19 Beta acceptance =="

pnpm test
pnpm alpha:acceptance
pnpm e2e

echo "Beta acceptance checks passed."
