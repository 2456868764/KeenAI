#!/bin/sh
set -e

cd /app
pnpm db:migrate

if [ "${KEENAI_AUTO_SEED:-}" = "1" ]; then
  pnpm seed || true
fi

cd /app/apps/api
exec bun src/index.ts
