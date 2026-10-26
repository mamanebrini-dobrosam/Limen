#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# This hook is for the development workspace, never the published app.
if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Post-merge setup must not run against production." >&2
  exit 1
fi

npm ci --include=dev --no-audit --no-fund
npm run db:migrate
npm run build
