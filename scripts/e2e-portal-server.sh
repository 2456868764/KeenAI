#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${E2E_API_URL:-http://localhost:8190}"
PORT="${E2E_PORTAL_PORT:-3202}"

export NEXT_PUBLIC_API_URL="$API_URL"
export NEXT_PUBLIC_PORTAL_ORG_SLUG=demo
export NEXT_PUBLIC_PORTAL_URL="http://localhost:$PORT"

cd "$ROOT"
pnpm --filter @keenai/portal build
exec pnpm --filter @keenai/portal exec next start -p "$PORT"
