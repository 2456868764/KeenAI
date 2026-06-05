#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_URL="${E2E_API_URL:-http://localhost:8190}"
PORT="${E2E_DASHBOARD_PORT:-3200}"

export NEXT_PUBLIC_API_URL="$API_URL"

cd "$ROOT"
pnpm --filter @keenai/dashboard build
exec pnpm --filter @keenai/dashboard exec next start -p "$PORT"
