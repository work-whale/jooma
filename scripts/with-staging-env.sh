#!/usr/bin/env bash
# Run a command with .env.local's values in the process environment.
#
# Why: `next build` and `next start` run in production mode, where Next ranks
# .env.production.local ABOVE .env.local. If that file exists (for example from
# a production env pull), a local test build silently talks to production.
# Process environment variables beat every .env file, so this pins the build
# and server to whatever .env.local points at (staging). It refuses to run if
# .env.local itself points at the production project.
#
#   bash scripts/with-staging-env.sh npx next build
#   bash scripts/with-staging-env.sh npx next start --port 3000
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
# shellcheck disable=SC1091
source <(sed 's/\r$//' .env.local)
set +a
case "${NEXT_PUBLIC_SUPABASE_URL:-}" in
  *hhgfhhofbhzioywnppzr*) echo "Refusing: .env.local points at PRODUCTION." >&2; exit 1 ;;
esac
exec "$@"
