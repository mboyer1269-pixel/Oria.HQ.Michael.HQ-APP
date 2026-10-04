#!/bin/sh
# Harness de qualification réelle : PostgreSQL + PostgREST jetables + Migrations réelles
# Conçu pour exécuter le CLI hôte d'admission contre une base PostgreSQL physique.
# En l'absence de moteur de conteneur, signale immédiatement et explicitement le blocage (code 127).

set -eu

ROOT="${1:-$(pwd)}"

# Détection préalable stricte de Docker (binaire présent et démon accessible avec timeout borné par appel)
if ! command -v docker >/dev/null 2>&1 || ! timeout -k 2 5 docker info >/dev/null 2>&1 < /dev/null; then
  echo "==========================================================================" >&2
  echo "[BLOCAGE INFRASTRUCTURE : DOCKER INDISPONIBLE]" >&2
  echo "Le jalon de qualification réelle (PostgreSQL + PostgREST + migrations) requiert un" >&2
  echo "moteur de conteneur Docker pour instancier :" >&2
  echo "  - PostgreSQL jetable avec volume éphémère" >&2
  echo "  - Les migrations réelles (db/migrations/0001_missions.sql)" >&2
  echo "  - La passerelle PostgREST réelle avec port dynamique" >&2
  echo "Conformément aux directives de qualification, aucun mock silencieux n'est injecté." >&2
  echo "Statut : BLOCAGE INFRASTRUCTURE DÉTECTÉ." >&2
  echo "==========================================================================" >&2
  exit 127
fi

# Détection de l'exécutable node
NODE_BIN=$(command -v node || echo "/home/michael_/.gemini/antigravity/scratch/tools/node/bin/node")
if [ ! -x "$NODE_BIN" ]; then
  echo "Node.js introuvable ($NODE_BIN)" >&2
  exit 1
fi

RUN_ID="$(date +%s)_$$"
RUN_TMP_DIR=$(mktemp -d -t "oria-intake-run-$RUN_ID.XXXXXX")
WINNER_STATE_FILE="$RUN_TMP_DIR/winner-state.json"
PG_IMAGE="postgres:16.4-alpine"
REST_IMAGE="postgrest/postgrest:v12.2.0"
VOLUME="oria-intake-real-$RUN_ID"
NET="oria-intake-net-$RUN_ID"
PG_NAME="oria-pg-$RUN_ID"
REST_NAME="oria-rest-$RUN_ID"
ids=""

cleanup() {
  echo "--- Nettoyage des ressources jetables du run $RUN_ID ---"
  if [ -n "$ids" ]; then
    for id in $ids; do timeout -k 2 10 docker rm -f "$id" >/dev/null 2>&1 < /dev/null || true; done
  fi
  timeout -k 2 10 docker network rm "$NET" >/dev/null 2>&1 < /dev/null || true
  timeout -k 2 10 docker volume rm "$VOLUME" >/dev/null 2>&1 < /dev/null || true
  rm -rf "$RUN_TMP_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=== CRÉATION DE L'ENVIRONNEMENT DOCKER JETABLE ==="
timeout -k 2 15 docker network create --label "oria.purpose=intake-proof-real-$RUN_ID" "$NET" >/dev/null < /dev/null
timeout -k 2 15 docker volume create --label "oria.purpose=intake-proof-real-$RUN_ID" "$VOLUME" >/dev/null < /dev/null

# Démarrage de PostgreSQL avec port dynamique localhost (timeout borné)
pg=$(timeout -k 2 25 docker run -d --label "oria.purpose=intake-proof-real-$RUN_ID" \
  --name "$PG_NAME" \
  --network "$NET" \
  --memory 256m --cpus 0.5 --pids-limit 128 \
  --mount "type=volume,src=$VOLUME,dst=/var/lib/postgresql/data" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=postgres \
  -p 127.0.0.1:0:5432 \
  "$PG_IMAGE" < /dev/null)
ids="$ids $pg"

# Attente readiness PostgreSQL bornée
echo "Attente de PostgreSQL..."
i=0
until timeout -k 2 3 docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 < /dev/null; do
  i=$((i+1))
  [ "$i" -lt 80 ] || { echo "PostgreSQL n'est pas devenu prêt dans le délai imparti" >&2; exit 1; }
  sleep 0.25
done
echo "✔ PostgreSQL jetable opérationnel."

# Application des migrations réelles du dépôt
echo "--- Application des migrations réelles (0001_missions.sql) ---"
if [ ! -f "$ROOT/db/migrations/0001_missions.sql" ]; then
  echo "Fichier de migration manquant : $ROOT/db/migrations/0001_missions.sql" >&2
  exit 1
fi

{
  cat "$ROOT/db/migrations/0001_missions.sql"
  echo "CREATE ROLE qualification_service NOLOGIN BYPASSRLS;"
  echo "GRANT USAGE ON SCHEMA public TO qualification_service;"
  echo "GRANT ALL ON ALL TABLES IN SCHEMA public TO qualification_service;"
} | timeout -k 2 15 docker exec -i "$pg" psql -h 127.0.0.1 -U postgres -X -q -v ON_ERROR_STOP=1
echo "✔ Schéma et rôle de qualification appliqués en base."

# Démarrage de PostgREST avec port dynamique localhost publié (timeout borné)
echo "--- Démarrage de PostgREST ---"
rest=$(timeout -k 2 25 docker run -d --label "oria.purpose=intake-proof-real-$RUN_ID" \
  --name "$REST_NAME" \
  --network "$NET" \
  --memory 128m --cpus 0.5 \
  -e "PGRST_DB_URI=postgres://postgres@$PG_NAME:5432/postgres" \
  -e PGRST_DB_ANON_ROLE=qualification_service \
  -e PGRST_DB_SCHEMAS=public \
  -p 127.0.0.1:0:3000 \
  "$REST_IMAGE" < /dev/null)
ids="$ids $rest"

# Récupération dynamique du port hôte PostgREST
rest_host_port=$(timeout -k 2 5 docker port "$rest" 3000 < /dev/null | head -n 1 | awk -F: '{print $NF}')

# Boucle active de readiness PostgREST bornée (vérification HTTP active avec timeout par appel)
echo "Attente de PostgREST sur port dynamique $rest_host_port..."
i=0
until [ "$(curl -s -m 3 --connect-timeout 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$rest_host_port/" 2>/dev/null || echo "000")" = "200" ]; do
  i=$((i+1))
  [ "$i" -lt 60 ] || { echo "PostgREST n'est pas devenu prêt sur le port $rest_host_port" >&2; exit 1; }
  sleep 0.25
done
echo "✔ PostgREST opérationnel sur http://127.0.0.1:$rest_host_port."

# Exécution des épreuves CLI réelles (Phase 1)
echo "=== EXÉCUTION DU HARNAIS CLI (ADMISSION, CONCURRENCE DIVERGENTE, MÊME PAYLOAD, COUPURE RÉSEAU) ==="
HQ_ROOT="$ROOT" POSTGREST_DIRECT_URL="http://127.0.0.1:$rest_host_port" WINNER_STATE_FILE="$WINNER_STATE_FILE" "$NODE_BIN" "$ROOT/proofs/prove-cli-real-db.mjs"

# Assertions SQL directes comptées depuis l'extérieur du script via psql (provoquant exit 1 en cas d'écart)
echo "=== ASSERTIONS SQL STRICTES HORS DU SCRIPT ==="
timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select workspace_id, count(*), min(status), bool_and(requires_approval), max(autonomy_level) from public.missions group by workspace_id order by workspace_id;" < /dev/null

total_missions=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions;" < /dev/null)
echo "Total missions en base : $total_missions"
[ "$total_missions" -eq 4 ] || {
  echo "ÉCHEC ASSERTION SQL : Exactement 4 missions attendues en base, obtenu $total_missions" >&2
  exit 1
}

invalid_missions=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions where status != 'draft' or requires_approval != true or autonomy_level != 0;" < /dev/null)
[ "$invalid_missions" -eq 0 ] || {
  echo "ÉCHEC ASSERTION SQL : $invalid_missions missions non conformes détectées" >&2
  exit 1
}

non_ws_a=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions where workspace_id != 'synthetic-ws-a';" < /dev/null)
[ "$non_ws_a" -eq 0 ] || {
  echo "ÉCHEC ASSERTION SQL : Isolation de workspace violée ($non_ws_a missions hors de synthetic-ws-a)" >&2
  exit 1
}

lost_count=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions where input->'development'->>'requestId' = '33333333-3333-4333-8333-333333333333';" < /dev/null)
[ "$lost_count" -eq 1 ] || {
  echo "ÉCHEC ASSERTION SQL : La mission avec réponse perdue doit exister exactement 1 fois, obtenu $lost_count" >&2
  exit 1
}

same_count=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions where input->'development'->>'requestId' = '44444444-4444-4444-8444-444444444444';" < /dev/null)
[ "$same_count" -eq 1 ] || {
  echo "ÉCHEC ASSERTION SQL : La mission avec créations simultanées identiques doit exister exactement 1 fois, obtenu $same_count" >&2
  exit 1
}

echo "✔ Assertions SQL strictes validées (exactement 4 missions, toutes en draft, requires_approval=true, autonomy=0, unicités garanties)."

# Épreuve de persistance après arrêt et redémarrage de PostgreSQL
echo "=== ÉPREUVE DE PERSISTANCE : ARRÊT ET REDÉMARRAGE DU CONTENEUR ==="
timeout -k 2 15 docker stop "$pg" >/dev/null < /dev/null
echo "PostgreSQL arrêté."
timeout -k 2 15 docker start "$pg" >/dev/null < /dev/null
echo "PostgreSQL redémarré. Attente de disponibilité..."

i=0
until timeout -k 2 3 docker exec "$pg" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 < /dev/null; do
  i=$((i+1))
  [ "$i" -lt 80 ] || { echo "PostgreSQL n'a pas redémarré dans le délai imparti" >&2; exit 1; }
  sleep 0.25
done

# Redémarrage du conteneur PostgREST pour rétablir la passerelle
timeout -k 2 15 docker restart "$rest" >/dev/null < /dev/null
rest_host_port=$(timeout -k 2 5 docker port "$rest" 3000 | head -n 1 | awk -F: '{print $NF}')
i=0
until [ "$(curl -s -m 3 --connect-timeout 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$rest_host_port/" 2>/dev/null || echo "000")" = "200" ]; do
  i=$((i+1))
  [ "$i" -lt 60 ] || { echo "PostgREST n'est pas redevenu prêt après redémarrage" >&2; exit 1; }
  sleep 0.25
done

# Vérification par client CLI neuf après redémarrage
echo "--- Relecture par client neuf (--verify-restart) ---"
HQ_ROOT="$ROOT" POSTGREST_DIRECT_URL="http://127.0.0.1:$rest_host_port" WINNER_STATE_FILE="$WINNER_STATE_FILE" "$NODE_BIN" "$ROOT/proofs/prove-cli-real-db.mjs" --verify-restart

# Assertion SQL finale après redémarrage : compte total et contenu exact du gagnant
total_after_restart=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select count(*) from public.missions;" < /dev/null)
echo "Total missions après redémarrage : $total_after_restart"
[ "$total_after_restart" -eq 4 ] || {
  echo "ÉCHEC ASSERTION SQL : Perte de données après redémarrage ($total_after_restart != 4)" >&2
  exit 1
}

concurrent_title=$(timeout -k 2 10 docker exec "$pg" psql -h 127.0.0.1 -U postgres -X -A -t -q -c \
  "select title from public.missions where input->'development'->>'requestId' = '22222222-2222-4222-8222-222222222222';" < /dev/null)

recorded_title=""
if [ -f "$WINNER_STATE_FILE" ]; then
  recorded_title=$("$NODE_BIN" -e "const fs = require('fs'); const s = JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); process.stdout.write(s.payload.title);" "$WINNER_STATE_FILE" 2>/dev/null || true)
fi

if [ -n "$recorded_title" ]; then
  [ "$concurrent_title" = "$recorded_title" ] || {
    echo "ÉCHEC ASSERTION SQL : Le titre après redémarrage ($concurrent_title) ne correspond pas au gagnant enregistré ($recorded_title)" >&2
    exit 1
  }
else
  [ "$concurrent_title" = "Mission 2A : Audit de conformité des flux d'admission" ] || \
  [ "$concurrent_title" = "Mission 2B : Titre divergent concurrentiel simultané" ] || {
    echo "ÉCHEC ASSERTION SQL : Le titre conservé après redémarrage est corrompu ($concurrent_title)" >&2
    exit 1
  }
fi

echo "✔ Données intactes après redémarrage complet (exactement 4 missions, contenu exact du gagnant préservé)."

echo "=== QUALIFICATION RÉELLE TERMINÉE AVEC SUCCÈS ==="
