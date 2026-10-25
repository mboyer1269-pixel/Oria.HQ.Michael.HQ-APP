# Run 5 — crash/reprise RÉELLE (Codex CLI abonnement, gpt-5.6-luna), rejouée par `../replay-crash-resume.sh`

**Tête testée : `de80134`** (arbre propre, `00-head.txt`). Même protocole que run4 :
- spec → code → tests verts ; SIGKILL de l'hôte pendant la révision ; CLI orphelin vivant (`06-crash.txt`).
- Après redémarrage : GET → orphelin toujours vivant ; POST autorisé sans /resume → 409 `stale_lock_requires_explicit_resume`,
  orphelin tué après contrôle d'identité (`orphan_child_reaped`, `07-after-restart.txt`).
- `/resume` reprend la même session codex, commit `7e6d8da`, tests verts ; modelProof requested = observed (`11-summary.txt`).
- Le dossier existant `~/oria-atelier-repos/michael-hq/` (sans réservation) a été adopté par l'espace `michael-hq`
  (identifiant égal au nom normalisé, SENT-412-14) : `.oria-workspace-id` = `michael-hq`.

Limite : banc = vrais handlers servis par `local-api-host.mjs` (session fixture #410), pas `next start`.
