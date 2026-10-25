# Run 4 — crash/reprise RÉELLE rejouée par script (Codex CLI abonnement, gpt-5.6-luna)

Rejoué par `docs/atelier-e1-d-evidence/replay-crash-resume.sh` (OUT=…/run4) via `host.sh`, tous deux dans le dépôt.
**Tête testée : `d3dc13a`** (arbre propre, voir `00-head.txt`). Commits suivants : `242d047` (carte système régénérée,
docs) et `ab70a78` (suppression d'un import inutilisé) : aucun changement de comportement.

Preuves réelles (fichiers de ce dossier) :
- spec → code → test verts, puis révision CAD$ ; SIGKILL du serveur hôte pendant la révision (`06-crash.txt`) : enfant codex orphelin vivant.
- Après redémarrage : GET → orphelin **toujours vivant** (SENT-412-9 : pas de nettoyage sur lecture) ; POST autorisé sans /resume
  → 409 `stale_lock_requires_explicit_resume` + orphelin tué après contrôle d'identité (`orphan_child_reaped`, `07-after-restart.txt`).
- `/resume` reprend la même session codex (`resumedFrom` = sessionId interrompu), commit `4afe57d`, tests verts ;
  `modelProof` requested = observed = gpt-5.6-luna (`11-summary.txt`).
- Dépôt sous `~/oria-atelier-repos/michael-hq/` (SENT-412-8).

Limite : banc = vrais handlers servis par un serveur Node (`local-api-host.mjs`, session fixture #410), pas `next start`.
