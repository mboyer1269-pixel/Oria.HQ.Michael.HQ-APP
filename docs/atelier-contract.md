# Contrat de données — écran Atelier (`atelier-mission/v1`)

Destinataire : agent Oria Design. Source : `src/server/atelier/atelier-mission.ts`.
Exemple réel complet : `docs/atelier-e1-d-evidence/mission.json` (mission exécutée le 2026-10-25).

## Endpoints stables v1 (runtime Node, contexte espace de la PR #410)
Session : `requireWorkspaceApiSession(request)` ; espace via en-tête `x-oria-workspace` ou `?workspace=`.
Lecture : owner **ou** member de l'espace. Écriture (POST) : owner de l'espace (sinon 403 `atelier_owner_only`) **et**
titulaire de l'abonnement CLI (`ORIA_SUBSCRIPTION_OWNERS`, ids séparés par des virgules ; défaut `MICHAEL_HQ_OWNER_ID` ;
vide = personne), sinon 403 `subscription_owner_only`. Toutes les erreurs ont la forme `{ error, code }` (chat :
403 `SUBSCRIPTION_OWNER_ONLY`). Dépôts rangés par espace : `$ORIA_ATELIER_REPOS_ROOT/<workspaceId en minuscules>/…` ; le dossier est créé et réservé (`.oria-workspace-id`, publié par tmp+link) à la première mission owner+titulaire ; un dossier existant non réservé n'est adopté que par l'identifiant égal à son nom normalisé (minuscules) ; un autre identifiant qui tombe sur le même dossier → 409 `workspace_path_collision`. Mission d'un autre espace → 404 (jamais 403, pas de fuite).

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| GET | `/api/atelier/missions` | — | `{ contract: "atelier-mission-list/v1", missions: MissionView[] }` (espace courant, `updatedAt` desc) |
| POST | `/api/atelier/missions` | `{ title, need, repoPath, runtimeId: "codex"\|"claude-code", modelId }` | 202 `{ missionId, stepId, mission, events }` — lance l'étape `spec` |
| GET | `/api/atelier/missions/:id` | — | `MissionView` |
| GET | `/api/atelier/missions/:id/events` | — | `text/event-stream` (voir SSE) |
| POST | `/api/atelier/missions/:id/steps` | `{ kind: "code"\|"revision", prompt }` (prompt requis, 1–8000 car.) | 202 `{ missionId, stepId, mission }` ; `revision` = demande de correction |
| POST | `/api/atelier/missions/:id/interrupt` | — | 202 si signal envoyé, sinon 409 ; `{ interrupted, reason }` (`signal_sent`, `not_running`, `no_child`, `runner_dead_resume_required`, `identity_mismatch`, `identity_unknown`) |
| POST | `/api/atelier/missions/:id/resume` | `{ prompt? }` | 202 `{ missionId, stepId, mission }` — reprend la même session CLI ; seul moyen de récupérer un verrou périmé ; l'étape reprise garde le `kind` interrompu |
| POST | `/api/atelier/missions/:id/verify` | — | 200 : `npm test` (commande fixe) dans le dépôt de mission |
| GET | `/api/atelier/missions/:id/artifacts/:artifactId` | — | octets bruts ; `content-type`, `x-artifact-sha256` |

### SSE `/events`
`event: snapshot` (MissionView) → `event: mission` (une ligne de `events.jsonl` : `{ at, type, stepId, data }`, types
`step_started`, `step_finished`, `interrupt_requested`, `stale_lock_reclaimed`, …) → `event: agent` (lignes JSON du transcript CLI
en direct) → `event: end` `{ status, lock: { live } | null }` quand plus rien ne tourne (ou si le runner est mort : `lock.live=false`).

### Codes d'erreur (`{ error, code }`)
401 non authentifié · 403 espace refusé / `atelier_owner_only` / `subscription_owner_only` · 404 `not_found` · 400 `invalid_request`, `model_unavailable`, `invalid_workspace_id`,
`repo_outside_atelier_root`, `repo_not_git` · 409 `mission_locked_by_live_runner`, `stale_lock_requires_explicit_resume`,
`stale_lock_reclaim_in_progress`, `no_session_to_resume`, `workspace_path_collision` · 503 `runtime_disabled`, `process_identity_unavailable`,
`subscription_auth_required`, `api_key_present` (refus si OPENAI_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, CODEX_API_KEY
ou CLAUDE_CODE_OAUTH_TOKEN est défini).

### Verrou et reprise
- `run.lock` (et `run.lock.reclaim`) sont publiés déjà remplis : fichier temporaire puis `link()` exclusif, donc jamais vides.
  Contenu : `runnerPid/runnerStart`, `childPid/childStart`, jeton, horodatage.
- Identité d'un PID = son heure de démarrage : Linux `/proc/<pid>/stat` (champ 22) ; ailleurs (macOS/BSD) repli
  `ps -o etime=,comm= -p <pid>` lancé avec `TZ=UTC LC_ALL=C` : démarrage = maintenant − durée écoulée (époque, indépendant du fuseau et de la locale), jeton `ps:<pid>:<époque s>:<commande>`, comparé avec une tolérance explicite de ±2 s (même pid et même commande exigés). Sans aucune des deux, l'identité est **non prouvable** : elle
  n'est jamais considérée vivante (aucun blocage à vie) et jamais tuée (aucun kill à l'aveugle). Un nouveau verrou est
  alors refusé : 503 `process_identity_unavailable`. `pidAlive` traite EPERM comme vivant.
- Reprise d'un verrou périmé : uniquement via `/resume`, sérialisée par `run.lock.reclaim`, avec relecture et contrôle du
  jeton. Un `run.lock.reclaim` abandonné (propriétaire mort ou non prouvable, ou illisible et vieux de plus de 10 s) est
  cassé ainsi : bail par instance (`mkdir` atomique de `run.lock.reclaim.breaking-<inode>-<ctime>-<génération>`, 10 s),
  puis capture atomique (`rename` vers un nom privé), vérification sous ce nom (même inode, mêmes octets, propriétaire
  toujours mort) et seulement alors suppression. Si un fichier frais a été capturé (casseur suspendu au-delà du bail),
  il est remis en place par `link()` sans écraser ; si un autre fichier a été publié entre-temps (fenêtre de quelques µs),
  la capture fraîche est conservée, jamais supprimée. Les baux et captures mortes de plus de 10 s sont purgés.
- Nettoyage des enfants CLI orphelins (runner mort) : seulement si l'heure de démarrage correspond, et seulement lors
  d'une action POST autorisée (owner et titulaire de l'abonnement), jamais sur une lecture. Le verrou est conservé :
  la reprise reste explicite.
Stockage : `$ORIA_ATELIER_ROOT` (défaut `~/.oria-atelier/missions/<id>/`) ; dépôts sous `$ORIA_ATELIER_REPOS_ROOT/<workspaceId>/` uniquement (défaut `~/oria-atelier-repos`).
CLI opérateur équivalent : `node src/scripts/atelier/mission.mjs create … [--runtime=codex|claude-code]`.

## MissionView
```ts
{
  contract: "atelier-mission/v1";
  id: string;            // UUID
  title: string; need: string;               // besoin exprimé
  createdAt: string; updatedAt: string;      // ISO-8601 UTC (afficher en heure locale)
  status: "created" | "running" | "interrupted" | "awaiting_review" | "failed" | "blocked";
  runtime: { runtimeId: "codex" | "claude-code"; consumptionMode: "subscription"; authMode: "chatgpt_session" | "claude_ai_session"; requestedModelId: string };
  repo: { path: string; baseBranch: string; branch: string; baseSha: string; headSha: string };
  sessionId: string | null;                  // fil Codex courant (reprise)
  lock: { runnerPid: number; childPid: number | null; stepId: string; since: string } | null; // non nul = en cours
  steps: Step[];                             // ordre chronologique
  artifacts: Artifact[];
  modelProof: { requested: string; observed: string | null; matches: boolean };
}
Step = {
  id: string; kind: "spec" | "code" | "test" | "preview" | "revision";
  status: "running" | "succeeded" | "failed" | "interrupted" | "blocked";
  startedAt: string; endedAt: string | null;
  executor: "codex_cli" | "claude_code_cli" | "runner"; // runner = vérification exécutée par Oria, pas déclarée par l'agent
  sessionId: string | null; resumedFrom: string | null;   // resumedFrom non nul ⇒ badge « reprise »
  requestedModelId: string | null; observedModelId: string | null; // observé = lu dans la sortie CLI (codex : rollout de session ;
                                   // claude : `message.model` du dernier événement `assistant` stream-json — jamais `system/init.model`, simple écho de la requête)
  exitCode: number | null;
  reason: string | null;   // runner_died | signal_SIGKILL | subscription_quota | cli_nonzero_exit
  commitSha: string | null;
}
Artifact = { id: string; kind: "spec" | "diff" | "test_log" | "preview" | "transcript" | "commit";
  stepId: string; path: string; sha256: string; bytes: number; createdAt: string }
```

## Règles d'affichage
- `status` → libellés FR : created « Créée », running « En cours », interrupted « Interrompue — reprise possible »,
  awaiting_review « À relire », failed « Échec », blocked « Bloquée (abonnement/quota) ».
- Claude Code : reprise = `claude -p … --resume <sessionId>` (même session_id), quota = `rate_limit_event.status = "rejected"` ou résultat
  d'erreur « usage limit » ⇒ étape `blocked`. Le catalogue doit porter l'identifiant API exact (ex. `claude-haiku-4-5-20251001`) :
  un alias (`claude-haiku-4-5`) donne `matches: false` car l'observé est l'identifiant daté renvoyé par l'API.
- `modelProof.matches === false` avec `observed` non nul ⇒ alerte rouge (modèle substitué). `observed === null` ⇒ « non prouvé ».
- Les étapes `executor: "runner"` (tests, aperçu) sont des preuves ; les messages de l'agent (transcript) n'en sont pas.
- Artefact `preview` `.png` ⇒ image ; `.diff` ⇒ vue diff ; `test_log` ⇒ bloc monospace ; `transcript` (JSONL Codex) ⇒ repliable.
- Aucune donnée démo : liste vide ⇒ « Aucune mission atelier locale ».
- Un panneau minimal existe déjà : `src/features/atelier/components/atelier-local-missions.tsx` (inséré dans `/hq/atelier`).

### Résidus connus
- SENT-412-3 (kill d'un pid recyclé) : le chef de groupe est vérifié par son heure de démarrage avant tout kill. Reste :
  si le chef est mort mais que des petits-enfants du CLI survivent dans son groupe, ils ne sont pas tués (`gone`) — choix
  délibéré, on ne tue jamais un groupe sans preuve d'identité.
- SENT-412-4 (missions hors du modèle espace) : abonnement CLI (412-8) et dépôts (412-8/13/14) sont désormais par
  espace. Reste : le stockage des missions `~/.oria-atelier/missions/<id>` est commun à tous les espaces sur la machine,
  l'isolement se fait par filtrage (`workspaceId`, 404 hors espace), pas par dossier.

### Hors #412 (à traiter dans #410)
`src/server/auth/owner.ts:130` (`requireOwnerApiSession`, ancienne garde propriétaire) sert 47 routes, pas seulement
`/api/sales/**` : notamment `/api/agents/[agentId]/execute`, `/api/agents/[agentId]/execution-intents`,
`/api/agents/execution-intents/[intentId]/{approve,reject}`, `/api/missions/**`, `/api/memory/**`, `/api/outbound/**`,
`/api/marketplace/**`, `/api/arena/**`, `/api/cron/**`, `/api/orchestration/**` (liste : `grep -rl requireOwnerApiSession src/app`). Elle renvoie
encore `{ error }` sans `code` en 401/403. Ce fichier vient de #410 et n'est pas utilisé par l'Atelier : non modifié ici.
Correctif proposé pour #410 : `{ error, code: "AUTH_REQUIRED" }` (401) et `{ error, code: "OWNER_ONLY" }` (403).

## Scan de secrets avant commit (SENT-412-39 / 40 / 41)

Avant chaque commit d'étape, les lignes ajoutées du diff sont scannées (jetons `\bsk-…`, JWT, champs `refresh_token`/`access_token`/`id_token` avec une valeur littérale entre guillemets, clés auth.json `OPENAI_API_KEY`/`last_refresh`/`claudeAiOauth`). S'il y a un résultat : pas de commit, quarantaine, `secret_detected`.

**Ce scan est best-effort et contournable** : il ne détecte pas les secrets encodés (base64, hex), découpés sur plusieurs lignes ou fichiers, placés dans des fichiers binaires, ou mis dans des noms de fichiers. Un secret non détecté reste dans la branche locale de la mission, puisque l'Atelier ne pousse jamais. **L'owner doit relire le diff avant tout push.** Ce scan n'est pas une garantie de sécurité.
