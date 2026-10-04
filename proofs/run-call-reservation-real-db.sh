#!/bin/sh
# Disposable PostgreSQL qualification for the call-reservation ledger.
# No provider network and no model call. If Docker is absent, exit 127
# and print NON EXECUTE. Do not treat that exit as a passed proof.

set -eu

ROOT="${1:-$(pwd)}"

if ! command -v docker >/dev/null 2>&1 || ! timeout -k 2 5 docker info >/dev/null 2>&1 < /dev/null; then
  echo "NON EXECUTE: Docker est absent. Le script n'a pas appliqué la migration et n'a pas exécuté les assertions PostgreSQL." >&2
  exit 127
fi

NODE_BIN=$(command -v node || true)
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "Node.js introuvable" >&2
  exit 1
fi

RUN_ID="$(date +%s)_$$"
PG_IMAGE="postgres:16.4-alpine"
VOLUME="oria-reservation-$RUN_ID"
NET="oria-reservation-net-$RUN_ID"
PG_NAME="oria-reservation-pg-$RUN_ID"
pg=""

cleanup() {
  echo "--- Nettoyage des ressources jetables du run $RUN_ID ---"
  if [ -n "$pg" ]; then
    timeout -k 2 10 docker rm -f "$pg" >/dev/null 2>&1 < /dev/null || true
  fi
  timeout -k 2 10 docker network rm "$NET" >/dev/null 2>&1 < /dev/null || true
  timeout -k 2 10 docker volume rm "$VOLUME" >/dev/null 2>&1 < /dev/null || true
}
trap cleanup EXIT INT TERM

timeout -k 2 15 docker network create "$NET" >/dev/null < /dev/null
timeout -k 2 15 docker volume create "$VOLUME" >/dev/null < /dev/null
pg=$(timeout -k 2 25 docker run -d \
  --name "$PG_NAME" \
  --network "$NET" \
  --memory 256m --cpus 0.5 --pids-limit 128 \
  --mount "type=volume,src=$VOLUME,dst=/var/lib/postgresql/data" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=postgres \
  -p 127.0.0.1:0:5432 \
  "$PG_IMAGE" < /dev/null)

i=0
until timeout -k 2 3 docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 < /dev/null; do
  i=$((i+1))
  [ "$i" -lt 80 ] || { echo "PostgreSQL n'est pas devenu prêt" >&2; exit 1; }
  sleep 0.25
done

timeout -k 2 15 docker exec -i "$pg" psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1 \
  < "$ROOT/db/migrations/0028_call_reservation.sql"

before=$(PG_CONTAINER="$pg" "$NODE_BIN" "$ROOT/proofs/prove-call-reservation-real-db.mjs" | sed -n 's/^BEFORE_RESTART //p')
[ -n "$before" ] || { echo "Assertion avant redémarrage absente" >&2; exit 1; }

timeout -k 2 15 docker stop "$pg" >/dev/null < /dev/null
timeout -k 2 15 docker start "$pg" >/dev/null < /dev/null
i=0
until timeout -k 2 3 docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 < /dev/null; do
  i=$((i+1))
  [ "$i" -lt 80 ] || { echo "PostgreSQL n'a pas redémarré" >&2; exit 1; }
  sleep 0.25
done

after=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select coalesce(string_agg(line, ',' order by line), '') from (select 'attempt|' || workspace_id || '|' || subject_id || '|' || caller_id || '|' || provider || '|' || model_id || '|' || currency || '|' || reserved_cents::text || '|' || state || '|' || network_emitted::text || '|' || reconciliation_required::text || '|' || max_tokens::text || '|' || input_bytes::text as line from public.hq_call_reservation union all select 'right|' || workspace_id || '|' || subject_id || '|' || caller_id as line from public.hq_call_emit_right) s;" < /dev/null)
after=$(printf '%s' "$after" | tr -d '\r')
before=$(printf '%s' "$before" | tr -d '\r')
[ "$before" = "$after" ] || {
  echo "ÉCHEC REPRISE: avant [$before] après [$after]" >&2
  exit 1
}

echo "✔ Reprise après redémarrage du conteneur: $after"
echo "QUALIFICATION RÉSERVATION TERMINÉE"
