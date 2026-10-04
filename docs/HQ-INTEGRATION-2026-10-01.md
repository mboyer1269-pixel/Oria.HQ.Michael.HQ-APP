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

## Qualification PostgreSQL réelle — 1 octobre, 06:27 UTC

Docker local rétabli, Antigravity a exécuté le CLI et les services de ce candidat
sur PostgreSQL/PostgREST jetables, migration réelle appliquée. Le premier essai
avait bloqué sur `docker exec -i ... psql -c`; Codex l'a constaté et a demandé
la correction. Le commit source `78df5171c37cb36d5f3f793f7865b607dccda986`,
repris dans `ad549d7`, ferme stdin quand inutile et ajoute `timeout -k 2`.
Seul le script du banc change; les sources produit validées restent identiques.

Le nouvel essai `1790836047_67270` a terminé avec code **0**. Codex a relu le
journal et les assertions : une mission par demande identique concurrente,
conflit sur contenu divergent, refus du workspace falsifié, réponse perdue
après commit récupérée sans doublon, quatre missions et leur contenu conservés
après redémarrage avec un client neuf. Toutes restent `draft`, avec approbation
requise et autonomie zéro. Les listes Docker filtrées sur ce run ne contiennent
plus de conteneur, volume ou réseau.

Images observées : `postgres:16.4-alpine` digest
`5660c2cbfea50c7a9127d17dc4e48543eedd3d7a41a595a2dfa572471e37e64c`,
`postgrest/postgrest:v12.2.0` digest
`2cf1efd2c9c2e7606610c113cc73e936d8ce9ba089271cb9cbf11aa564bc30c7`.
Script SHA256 `7bb134906e1532630b3f1b59f6e4dff92e7c69fe4f2bd09f4506dfeac1c12f6a`;
journal SHA256 `b1c5bc3a24bba43b0285c1b141510daddc6b6908e54584571f28521c2186238a`,
conservé dans `Orchestrator/.validation/real-infra-20261001/`.

Portée : persistance et contrat CLI/service réels. Le rôle de test `BYPASSRLS`
et l'identité synthétique ne qualifient pas l'authentification propriétaire,
les politiques RLS, le lanceur privilégié, Hermes ou un modèle. Le test de
redémarrage n'est pas une preuve de résistance à une panne électrique.

## Recette navigateur et revue — 1 octobre, 06:50 UTC

Cursor a revu la preuve PostgreSQL (`a279100` dans Orchestrator). Il confirme sa
validité dans le périmètre CLI/service et relève les limites RLS, réponse perdue
après réception par le proxy, redémarrage propre et assertion exacte du gagnant
portée par le script Node. Aucun de ces constats n'invalide le run.

Codex a exécuté les clics dans un vrai navigateur sur la fixture Next.js locale
d'Antigravity, important le formulaire du snapshot validé sans modifier sa logique.
Transport HTTP simulé : demande résiduelle sans envoi implicite, création explicite,
réessai sous même identifiant et JSON, changement de workspace pendant l'appel,
réponse tardive ignorée même si le transport ignore l'annulation, stockage corrompu
ou inaccessible sans envoi, puis rechargement et GET seul. Ces cas passent.
Le premier banc d'Antigravity avec DOM maison est exclu de cette preuve navigateur.

Correction de texte Claude `dc0772f`, reprise dans `e0d80e5` : le formulaire décrit
désormais la préparation/confirmation OpenHands, sans annoncer un lancement actif.
Un seul paragraphe changé, diff relu, lint ciblé réussi; validations globales non
répétées. Le snapshot de recette conserve l'ancien texte, avec comportement identique.
Composant testé SHA256 `cc290783b6105a2895943694e7796a92e56e16b711d864324183e0c043869222`.
La recette ne qualifie ni l'authentification réelle, ni RLS, ni un appel de modèle.

## Suite et conditions de sortie

1. Assemblage et contrôles centraux terminés dans cette copie isolée. La recette navigateur du formulaire et la qualification réelle restent distinctes.
2. Qualification du stockage, recette navigateur bornée et revue indépendante passées. Pour reproduire le banc stockage sur un hôte autorisé : `sh proofs/run-intake-real-db.sh "$PWD"`, Node 22, ressources jetables et ports loopback seulement.
3. Qualifier identité, compte, budget et outils de Hermes, puis une mission réelle jusqu'au résultat vérifié.
4. Faire valider la maquette par Michael avant de l'intégrer. Elle reste dans sa branche Antigravity séparée.

La disponibilité immédiate du HQ complet n'est pas démontrée.
