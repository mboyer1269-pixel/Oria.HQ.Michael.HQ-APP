#!/bin/sh
# Rejoue la preuve crash/reprise RÉELLE (Codex CLI abonnement) et écrit les preuves dans $OUT.
# Prérequis : node 22 sur le PATH, `codex login status` = ChatGPT, AUCUNE clé API dans l'environnement.
# Usage : OUT=/tmp/run docs/atelier-e1-d-evidence/replay-crash-resume.sh
set -eu
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"; cd "$ROOT"
OUT="${OUT:?OUT requis}"; PORT="${PORT:-4318}"; MODEL="${MODEL:-gpt-5.6-luna}"; WS=michael-hq; NAME="tip-calc-$(date +%s)"
for k in OPENAI_API_KEY ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN CODEX_API_KEY CLAUDE_CODE_OAUTH_TOKEN; do eval "v=\${$k:-}"; [ -z "$v" ] || { echo "refus : $k défini"; exit 2; }; done
mkdir -p "$OUT"; { date; git rev-parse HEAD; git status --porcelain | wc -l | sed 's/^/fichiers modifiés non commités: /'; } > "$OUT/00-head.txt"
echo "{\"revision\":\"replay\",\"entries\":[{\"runtimeId\":\"codex\",\"modelId\":\"$MODEL\"}]}" > "$OUT/catalog.json"
R="$HOME/oria-atelier-repos/$WS/$NAME"; mkdir -p "$R"; git -C "$R" init -q -b main
printf '{"name":"%s","type":"module","scripts":{"test":"node --test"}}\n' "$NAME" > "$R/package.json"; echo "# $NAME" > "$R/README.md"
git -C "$R" add -A; git -C "$R" -c user.name=t -c user.email=t@t commit -qm seed
host() { CATALOG="$OUT/catalog.json" PORT=$PORT "$ROOT/docs/atelier-e1-d-evidence/host.sh" > "$OUT/host-$1.log" 2>&1 & sleep 4; }
api() { curl -s -XPOST "localhost:$PORT/api/atelier/missions$1" -H 'content-type: application/json' -d "$2"; }
sse() { timeout "${2:-900}" curl -sN "localhost:$PORT/api/atelier/missions/$M/events" > "$OUT/$1" || true; }
host 1
api "" "{\"title\":\"Calculatrice de pourboire (replay)\",\"need\":\"Petite bibliothèque JS ESM sans dépendance : pourboire et partage d'addition entre N personnes (arrondi au cent), en euros, tests node --test.\",\"repoPath\":\"$R\",\"runtimeId\":\"codex\",\"modelId\":\"$MODEL\"}" > "$OUT/01-create.json"
M=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).missionId)' "$OUT/01-create.json"); echo "$M" > "$OUT/mission-id.txt"
sse 02-spec-sse.txt
api "/$M/steps" '{"kind":"code","prompt":"Implémente SPEC.md : lib ESM (pourboire, partage entre N, arrondi au cent, en euros) + tests node --test."}' > "$OUT/03-code-start.json"; sse 03-code-sse.txt
api "/$M/verify" '{}' > "$OUT/04-verify.json"
api "/$M/steps" '{"kind":"revision","prompt":"Correction demandée : passer des euros aux dollars canadiens ($) et documenter des boutons de pourboire 15/18/20 % dans le README. Garde les tests verts."}' > "$OUT/05-revision-start.json"
sse 05-revision-sse-before-crash.txt 60 & 
L="$HOME/.oria-atelier/missions/$M/run.lock"; i=0
while [ $i -lt 60 ] && ! grep -q '^event: agent' "$OUT/05-revision-sse-before-crash.txt" 2>/dev/null; do sleep 1; i=$((i+1)); done
cp "$L" "$OUT/06-lock-before-crash.json"
C=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).childPid)' "$L"); H=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).runnerPid)' "$L")
{ echo "child $C cmd=$(tr '\0' ' ' < /proc/$C/cmdline | cut -c1-120)"; echo "SIGKILL host pid=$H at $(date '+%T %Z')"; kill -9 "$H"; sleep 1
  echo "host alive? $(kill -0 $H 2>/dev/null && echo yes || echo no); orphan child alive? $(kill -0 $C 2>/dev/null && echo yes || echo no)"; } > "$OUT/06-crash.txt"
host 2
{ echo "== member-free read after restart (no reap on reads)"; curl -s "localhost:$PORT/api/atelier/missions/$M" > /dev/null; echo "orphan alive after GET? $(kill -0 $C 2>/dev/null && echo yes || echo no)"
  echo "== POST steps without resume"; api "/$M/steps" '{"kind":"revision","prompt":"x"}'; echo
  sleep 1; echo "orphan alive after authorised POST? $(kill -0 $C 2>/dev/null && echo yes || echo no)"
  grep orphan_child_reaped "$HOME/.oria-atelier/missions/$M/events.jsonl" || true; } > "$OUT/07-after-restart.txt"
api "/$M/resume" '{}' > "$OUT/09-resume-start.json"; sse 09-resume-sse.txt
api "/$M/verify" '{}' > "$OUT/10-verify.json"
cp "$HOME/.oria-atelier/missions/$M/events.jsonl" "$HOME/.oria-atelier/missions/$M/mission.json" "$OUT/"
node -e '
const m=JSON.parse(require("fs").readFileSync(process.argv[1]));
console.log(m.id, m.status, JSON.stringify(m.modelProof));
for (const s of m.steps) console.log(s.kind, s.status, s.executor, s.resumedFrom??"-", s.sessionId??"-", s.observedModelId??"-", (s.commitSha??"-").slice(0,7), s.reason??"");' "$OUT/10-verify.json" > "$OUT/11-summary.txt"
pkill -f "docs/atelier-e1-d-evidence/local-api-host.mjs" || true
cat "$OUT/11-summary.txt"
