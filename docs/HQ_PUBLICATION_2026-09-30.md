# Publication de la branche HQ — 30 septembre 2026

## Périmètre

Conservation sur GitHub des changements du dossier de mission, du raccordement
Memex, des contrats OpenHands, des parcours de permissions et reprise, des
optimisations de chargement et de leurs tests. README actualisé, plan constructeur
et liste de tâches ajoutés. L'ancien README reste une référence historique.

Les scripts hôte et de qualification sont publiés séparément dans le dépôt privé
`mboyer1269-pixel/oria-hq-orchestrator`. Memex Core conserve son propre dépôt et
sa branche `codex/memex-memory-foundations`.

## Vérifications exécutées sur HQ

- `npm run typecheck` : réussi.
- `npm run lint` : réussi, zéro erreur et cinq avertissements de variables inutilisées.
- `npm test` : 4 043 tests, 4 039 réussis, quatre ignorés, zéro échec.
- `npm run build` : réussi.
- `npm run smoke:joris` : réussi en mode local, sans écriture Supabase.
- `git diff --cached --check` : réussi après normalisation de fins de lignes.

La première suite complète avait signalé un faux positif du contrôle de marque :
la sous-chaîne de `MemoryAttachment` était interprétée comme une ancienne
orthographe du produit. Le contrôle distingue maintenant les mots des identifiants
et possède une régression positive/négative ; la suite complète a ensuite réussi.

## Exclusions et limites

Les sorties locales `output/` et `.playwright-cli/`, les vrais fichiers
d'environnement, les identifiants et les dépendances ne sont pas publiés.
Les exemples de configuration restent sans valeurs secrètes.

Publication sur `codex/hq-mission-dossier`, sans fusion automatique dans `main`.
Au moment de la préparation, cette branche avait seize commits propres et `main`
un commit absent de la branche. La consolidation de ces historiques est une
étape distincte ; cette publication ne prétend pas l'avoir faite.

Aucun service actif n'est déployé par cette opération. La première mission
Claude authentifiée, sa revue indépendante, le parcours complet de reprise et
l'intégration Antigravity restent à qualifier. Voir [HQ_TASKS.md](HQ_TASKS.md).
