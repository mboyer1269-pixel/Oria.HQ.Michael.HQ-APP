# Candidat d'intégration HQ — 1 octobre 2026

## Périmètre et provenance

Base produit : `e9ff840a38b4532b687bb29f3e2371afeeb3024e`.
Branche isolée : `codex/hq-delivery-integration`. Aucun déploiement ni fusion dans la branche principale.

- Routage Cursor : sept commits transférés jusqu'à `79b0568bd9b8ae9a3d2b2d992330c94add2e7671`, arbre source `558037ddc80cbcd58a001bb59c5244d79c98e8fa`. Refus des modèles non autorisés, tentatives et coût inconnu conservés, aucun repli payant implicite. Aucun budget durable ajouté.
- Admission Antigravity : les trois fichiers runtime/tests de `e02339f`, sans ses rapports historiques ni sa maquette. Harnais PostgreSQL/PostgREST repris à `720d513aff916bf62505e4678730375944b2e0b2`.
- Accès/reprise Claude : sources `13930e1` puis `abe4b81`, intégrées par `c4659f1` puis `2f08e96`. Le second commit corrige le lint et isole l'état et la charge du formulaire par workspace.

## Décision de consolidation

Classification : extension du module de missions existant. Propriétaire : équipe HQ. Problème : admission idempotente et récupération d'une demande sans démarrer l'exécution. Contrat partagé : service canonique `createDevelopmentService`, identités et autorisation utilisateur restent gérées par HQ. Entretien : aucune dépendance ajoutée; un adaptateur CLI et son banc de qualification.

Le CLI est un **outil hôte privilégié**, pas une API utilisateur ni un outil à exposer directement au modèle. Le commentaire sur un fichier de configuration protégé ne prouve pas son déploiement sécurisé. Le lanceur, la protection de cette configuration et la délégation d'identité doivent encore être qualifiés avant raccordement à Hermes.

AgentMemory/Memex demeure la mémoire locale de développement. Aucun accès à cette mémoire n'est ajouté au runtime du produit.

## Vérifications réalisées avant le lot Claude

- 61 tests ciblés du routage réussis dans cette copie, réseau remplacé par des fonctions de test.
- 18 tests d'admission/service/handlers réussis, stockage simulé.
- TypeScript, lint, compilation et `smoke:joris` réussis. Lint : cinq avertissements hors lot, zéro erreur. Smoke en stockage local, sans écriture Supabase et sans appel fournisseur.
- Syntaxe des deux fichiers du harnais réel vérifiée. **Aucune qualification PostgreSQL exécutée** : moteur Docker indisponible.

Ces résultats ne qualifient ni un compte fournisseur, ni Hermes installé, ni une mission OpenHands réelle. Ils ne s'appliquent pas automatiquement à un candidat modifié ensuite.

## Validation du candidat final `2f08e96`

Codex a validé une copie native Linux de `c4659f1` avec le diff exact du correctif Claude, puis vérifié les empreintes des deux fichiers de code/tests avant le cherry-pick. Le rapport Claude ajouté ne change pas le code exécuté. Node 22.14; fichier de verrouillage des dépendances identique, aucun paquet ajouté.

- 110 tests ciblés d'accès/reprise et de leurs dépendants : réussis. Les tests React couvrent le module et la clé d'instance, pas un rendu navigateur.
- `npm run typecheck` : réussi, 15 s.
- `npm run lint` : réussi, 29 s, zéro erreur et cinq avertissements préexistants hors lot.
- `npm run build` : réussi, 37 s.
- `npm run smoke:joris` : réussi, 1 s, stockage local sans modèle réel.

Journaux locaux : `Orchestrator/.validation/hq-candidate-native/`. Diff validé SHA256 `912ac8de1d33260bc07b41bb9e222bd8d9eaac1cd372d2b8224f3528dbd758b2`. Ces durées mesurent la validation de développement, pas les performances du HQ. Les 61 tests Cursor et 18 tests d'admission ont été rejoués auparavant sur leurs fichiers inchangés.

## Suite et conditions de sortie

1. Assemblage et contrôles centraux terminés dans cette copie isolée. La recette navigateur du formulaire et la qualification réelle restent distinctes.
2. Exécuter le harnais sur un hôte Docker autorisé : `sh proofs/run-intake-real-db.sh "$PWD"`, avec Node 22. Il crée des ressources jetables propres au run et des ports loopback; il ne doit jamais viser une base de production.
3. Qualifier identité, compte, budget et outils de Hermes, puis une mission réelle jusqu'au résultat vérifié.
4. Faire valider la maquette par Michael avant de l'intégrer. Elle reste dans sa branche Antigravity séparée.

La disponibilité immédiate du HQ complet n'est pas démontrée.
