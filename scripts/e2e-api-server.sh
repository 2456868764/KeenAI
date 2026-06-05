#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/data/e2e"

export DATABASE_URL="file:$ROOT/data/e2e/keenai.db"
export PORT="${E2E_API_PORT:-8190}"
export PORTAL_PUBLIC_READ=true
export NODE_ENV=development
export JWT_SECRET="${JWT_SECRET:-e2e-jwt-secret-at-least-32-characters-long}"
export APP_URL="${APP_URL:-http://localhost:3200}"
export PORTAL_APP_URL="${PORTAL_APP_URL:-http://localhost:3202}"

cd "$ROOT"
pnpm db:migrate
pnpm seed

cd "$ROOT/apps/api"
exec bun src/index.ts
