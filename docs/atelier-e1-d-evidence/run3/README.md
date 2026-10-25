# Run 3 — crash/reprise réel avec le nouveau verrou (code e4acbc4, 2026-10-25 05:36–05:39 HAE)
Banc local `local-api-host.mjs` (vrais handlers /api/atelier/**, session = fixture de test #410), Codex CLI abonnement
(ChatGPT), modèle gpt-5.6-luna, dépôt jetable ~/oria-atelier-repos/tip-calc-3. Mission dd374e2e-9cd5-426a-89d4-d5379e4decb6.
1. spec c5cb479 → code 6dff42c → verify OK (04-verify.json).
2. revision lancée ; verrou avec heures de démarrage (06-lock-before-crash.json) ; banc SIGKILL à 05:38:27 HAE (06-crash.txt) ; enfant Codex orphelin vivant.
3. Redémarrage : premier appel → `orphan_child_reaped` result=killed (heure de démarrage vérifiée), verrou conservé (07).
4. SSE `end` lock.live=false ; POST steps → 409 stale_lock_requires_explicit_resume (08).
5. POST resume → 202 ; `stale_lock_reclaimed` ; étape revision reprise dans la même session 01a1726c-e312-7ab2-93c1-4cc50a870bcb (resumedFrom), commit f9f0f6b (09).
6. verify : # fail 0 ; modelProof { requested: gpt-5.6-luna, observed: gpt-5.6-luna, matches: true } (10, 11).
