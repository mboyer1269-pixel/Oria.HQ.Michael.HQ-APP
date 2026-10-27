#!/bin/sh
# G2 — disposable PostgreSQL + PostgREST proof of the execution-intent approval
# binding. Local/CI ephemeral containers only; never a remote database, no
# secrets, no model call. If Docker is absent: exit 127 and print NON EXECUTE.
# Do not treat that exit as a passed proof.
set -eu
ROOT="${1:-$(pwd)}"

if ! command -v docker >/dev/null 2>&1 || ! timeout -k 2 5 docker info >/dev/null 2>&1 < /dev/null; then
  echo "NON EXECUTE: Docker est absent. Aucune migration appliquée, aucune assertion PostgreSQL exécutée." >&2
  exit 127
fi

RUN_ID="$(date +%s)_$$"
NET="oria-approval-net-$RUN_ID"
PG_NAME="oria-approval-pg-$RUN_ID"
REST_NAME="oria-approval-rest-$RUN_ID"
cleanup() {
  docker rm -f "$PG_NAME" "$REST_NAME" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker network create "$NET" >/dev/null
docker run -d --name "$PG_NAME" --network "$NET" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.4-alpine >/dev/null
i=0
until docker exec "$PG_NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -lt 120 ] || { echo "PostgreSQL not ready" >&2; exit 1; }; sleep 0.25
done

PSQL="docker exec -i $PG_NAME psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1"
{
  # Minimal Supabase platform stubs the real schema files depend on.
  echo "create role anon nologin; create role authenticated nologin;"
  echo "create role qualification_service nologin bypassrls;"
  echo "create schema auth; create table auth.users (id uuid primary key);"
  echo "create function auth.uid() returns uuid language sql stable as 'select null::uuid';"
  echo "insert into auth.users(id) values ('00000000-0000-4000-8000-0000000000a1');"
  # Real repository schema.
  cat "$ROOT/db/schema.sql"
  cat "$ROOT/db/migrations/0002_typed_ledger_events.sql"
  cat "$ROOT/db/migrations/0020_action_ledger_workspace_scope.sql"
  cat "$ROOT/db/migrations/0022_action_ledger_hash_chain_phase1.sql"
  cat "$ROOT/db/migrations/0023_action_ledger_hash_chain_phase2.sql"
  cat "$ROOT/db/migrations/0024_agent_execution_intents.sql"
  echo "grant usage on schema public to qualification_service;"
  echo "grant all on all tables in schema public to qualification_service;"
} | $PSQL
echo "✔ Real schema applied (schema.sql, 0002, 0020, 0022, 0023, 0024)."

docker run -d --name "$REST_NAME" --network "$NET" -p 127.0.0.1:0:3000 \
  -e "PGRST_DB_URI=postgres://postgres@$PG_NAME:5432/postgres" \
  -e PGRST_DB_ANON_ROLE=qualification_service -e PGRST_DB_SCHEMAS=public \
  postgrest/postgrest:v12.2.0 >/dev/null
port=$(docker port "$REST_NAME" 3000 | head -n 1 | awk -F: '{print $NF}')
i=0
until [ "$(curl -s -m 3 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$port/" || echo 000)" = "200" ]; do
  i=$((i+1)); [ "$i" -lt 120 ] || { echo "PostgREST not ready" >&2; docker logs "$REST_NAME" >&2; exit 1; }; sleep 0.25
done

HQ_ROOT="$ROOT" POSTGREST_DIRECT_URL="http://127.0.0.1:$port" \
PSQL_CMD="docker exec -i $PG_NAME psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1" \
  node "$ROOT/proofs/prove-approval-real-db.mjs"
