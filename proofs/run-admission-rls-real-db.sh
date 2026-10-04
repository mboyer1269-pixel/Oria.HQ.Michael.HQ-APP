#!/bin/sh
# Disposable PostgreSQL proof for ordinary anon/authenticated roles.
# Ordinary roles are created nobypassrls. No provider network and no model call.
# If Docker is absent, exit 127 and print NON EXECUTE. That is not a passed proof.

set -eu

ROOT="${1:-$(pwd)}"

if ! command -v docker >/dev/null 2>&1 || ! timeout -k 2 5 docker info >/dev/null 2>&1 < /dev/null; then
  echo "NON EXECUTE: Docker est absent. Les migrations n'ont pas été appliquées et les assertions SQL n'ont pas tourné." >&2
  exit 127
fi

RUN_ID="$(date +%s)_$$"
PG_IMAGE="postgres:16.4-alpine"
VOLUME="oria-admission-rls-$RUN_ID"
NET="oria-admission-rls-net-$RUN_ID"
PG_NAME="oria-admission-rls-pg-$RUN_ID"
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

timeout -k 2 15 docker exec -i "$pg" psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit nologin nosuperuser nobypassrls;
  end if;
end
$$;
SQL

for migration in \
  db/migrations/0001_missions.sql \
  db/migrations/0005_missions_rls.sql \
  db/migrations/0028_call_reservation.sql
do
  timeout -k 2 20 docker exec -i "$pg" psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1 \
    < "$ROOT/$migration"
done

timeout -k 2 20 docker exec -i "$pg" psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1 \
  < "$ROOT/proofs/prove-admission-rls.sql"

echo "ADMISSION RLS QUALIFIÉE $RUN_ID"
