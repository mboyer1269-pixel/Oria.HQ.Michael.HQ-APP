#!/bin/sh
# Banc local reproductible : sert les VRAIS handlers /api/atelier/** (session = fixture de test #410, aucune base distante).
# Usage : PORT=4318 OWNER=michael CATALOG=/chemin/catalog.json docs/atelier-e1-d-evidence/host.sh
set -eu
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
export ATELIER_LOCAL_USER="${OWNER:-michael}" MICHAEL_HQ_OWNER_ID="${OWNER:-michael}" ORIA_HQ_SUBSCRIPTION_RUNTIMES=1 \
  ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE="${CATALOG:?CATALOG requis}" PORT="${PORT:-4318}"
exec node docs/atelier-e1-d-evidence/local-api-host.mjs
