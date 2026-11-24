#!/usr/bin/env bash
# Write .env.local from environment variables, for a cloud session.
#
# A cloud container has no .env.local (it is gitignored). The "jooma" cloud
# environment sets NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SITE_URL; the owner
# adds NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (STAGING
# keys only) in the environment's settings. This copies them into .env.local so
# `next dev`, scripts/with-staging-env.sh and tests/support/users.ts all work.
#
#   bash scripts/cloud-env-local.sh          # writes .env.local, refuses production
#   pnpm dev                                 # then run the E2E specs as usual
#
# It never overwrites an existing .env.local, and refuses a production URL.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  echo ".env.local already exists; leaving it as it is." >&2
  exit 0
fi

missing=()
for name in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!name:-}" ]; then missing+=("$name"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing environment variables: ${missing[*]}" >&2
  echo "Add them in the cloud environment's settings (staging keys only), then start a new session." >&2
  exit 1
fi

case "$NEXT_PUBLIC_SUPABASE_URL" in
  *hhgfhhofbhzioywnppzr*) echo "Refusing: NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION." >&2; exit 1 ;;
esac

umask 077
{
  echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY"
  echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY"
  echo "NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}"
} > .env.local
echo "Wrote .env.local for $NEXT_PUBLIC_SUPABASE_URL"
