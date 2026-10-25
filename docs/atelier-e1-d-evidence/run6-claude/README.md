# Run 6 — crash/reprise RÉELLE avec **Claude Code CLI** (abonnement claude.ai Pro, `claude-haiku-4-5-20251001`), rejouée par `../replay-crash-resume.sh`

Commande : `OUT=… RUNTIME=claude-code docs/atelier-e1-d-evidence/replay-crash-resume.sh` (node 22, ANTHROPIC_API_KEY/OPENAI_API_KEY/… non définis ; le script refuse sinon).
**Tête testée : `3fd559a`** (arbre propre, `00-head.txt` : claude 2.1.283, authMethod claude.ai, apiProvider firstParty, subscriptionType pro).
Même protocole que run5 (Codex), même module `atelier-mission.ts`, mêmes handlers `/api/atelier/**` servis par `local-api-host.mjs` :
- spec → code → tests runner verts (`04-verify.json`) ; révision lancée ; SIGKILL de l'hôte pendant la révision ; CLI `claude` orphelin vivant (`06-crash.txt`, verrou `06-lock-before-crash.json`).
- Après redémarrage : GET → orphelin toujours vivant ; POST /steps sans /resume → 409 `stale_lock_requires_explicit_resume`, orphelin tué après contrôle d'identité (`orphan_child_reaped`, `07-after-restart.txt`).
- `/resume` relance `claude -p … --resume e60d4fc8-a0e7-4d09-a283-27603e8f15da` : même session_id dans le transcript repris, étape `revision` conservée, commit `0edd0e0`, tests runner verts (3/3).
- modelProof = `{"requested":"claude-haiku-4-5-20251001","observed":"claude-haiku-4-5-20251001","matches":true}` ; `observed` = `message.model` des événements `assistant` du stream-json (identifiant renvoyé par l'API), jamais `system/init.model` (écho de la requête) — voir `12-model-proof.txt`.
- Quota : `rate_limit_event` toujours `allowed`, fenêtre 5 h de 0,07 → 0,09 pendant le run (aucun blocage).

Réel vs simulé : tout ce dossier est RÉEL (CLI réel, abonnement réel, vrais handlers). Les tests unitaires (`fake-claude`) sont des SIMULATIONS et ne figurent pas ici.
Limites : banc = vrais handlers servis par `local-api-host.mjs` (session fixture #410), pas `next start`. Transcripts bruts non versionnés (ils listent les skills/plugins
de la config utilisateur claude) : conservés hors dépôt dans `/workspace/atelier-evidence/run6-claude/raw-transcripts/`, empreintes sha256 dans `12-model-proof.txt` et `mission.json`.
Tentative précédente avortée (bug catalogue du script, `model_unavailable` avant tout lancement CLI, 0 appel Claude) corrigée en `3fd559a`.
