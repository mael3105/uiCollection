#!/bin/sh
# Lance le robot de capture sur la base locale (`npm run db:start` d'abord).
set -e
eval "$(npx supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" exec node worker/src/main.js
