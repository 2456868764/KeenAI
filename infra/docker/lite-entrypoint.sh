#!/bin/sh
# Single-container lite: migrate → optional seed → dashboard (bg) → API (fg)
set -e

cd /app
pnpm db:migrate

if [ "${KEENAI_AUTO_SEED:-}" = "1" ]; then
  pnpm seed || true
fi

cd /app/apps/dashboard
pnpm start &
DASH_PID=$!

cd /app/apps/api
trap 'kill "$DASH_PID" 2>/dev/null || true' EXIT INT TERM
exec bun src/index.ts
