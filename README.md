# ORIA HQ — atelier de développement et centre de pilotage

État de cette branche au **1 octobre 2026**. Le code publié, les essais isolés
et le déploiement actif sont des états différents : ce dépôt ne prétend pas
qu'une mission autonome complète est déjà opérationnelle.

## Notre objectif

Construire un atelier de développement basé sur **OpenHands**, accessible dans
ORIA HQ : demander une modification, suivre les agents, vérifier les résultats
et essayer le produit. Utiliser ensuite cet atelier pour compléter ORIA HQ.
Hermes est l'interlocuteur et l'orchestrateur cible de cet atelier : les espaces
Discuter et Atelier partagent les mêmes missions, conservées par HQ. Son runtime
installé et son raccordement restent à qualifier. L'interface doit expliquer les
étapes importantes et rester utilisable sur mobile.

Le candidat de code `286a211` passe 65 tests ciblés et les quatre validations
globales. La qualification complémentaire `cf4fc4a` ajoute 10 tests et un banc
PostgreSQL réel des accès missions/budget, vérifiés indépendamment. Elle ne
modifie pas la logique applicative et ne prouve pas une session Supabase réelle.
Le budget reste désactivé. La maquette mobile reste séparée et attend la validation
visuelle avant intégration. [Résultats exacts et prochaine séquence](https://github.com/mboyer1269-pixel/oria-hq-orchestrator/blob/codex/cursor-recovery-handoff/docs/HQ-FRONTIERES-ACCES-2026-10-01.md).

- [Plan HQ constructeur](docs/PLAN-HQ-CONSTRUCTEUR.md)
- [Liste des tâches et critères de réussite](docs/HQ_TASKS.md)
- [Scripts d'intégration et runner OpenHands — dépôt privé](https://github.com/mboyer1269-pixel/oria-hq-orchestrator)
- [Memex Core — mémoire du projet](https://github.com/mboyer1269-pixel/memex-core)

## Architecture

| Brique | Responsabilité |
| --- | --- |
| Hermes, cible à raccorder | Interlocuteur quotidien, planification et délégation dans les outils autorisés |
| HQ / Next.js | Interface, missions, décisions, permissions et aperçu des résultats |
| Stockage HQ / Supabase | État durable, identité propriétaire et périmètre du workspace |
| OpenHands / runner isolé | Exécution du travail sur une copie du dépôt et suivi de son cycle de vie |
| Memex Core | Contexte du projet, provenance et publication gouvernée des connaissances |
| Vérifications / revue | Tests des changements exacts et contrôle indépendant avant livraison |

AgentMemory est une mémoire **locale de développement**. Ce n'est pas la mémoire
opérationnelle Memex des utilisateurs. Les services de modèles, leurs comptes et
leurs quotas restent distincts ; aucun abonnement ne devient automatiquement une API.

## Ce qui est implémenté

- Dossier de mission interactif, préparation et confirmation du lancement.
- Contrats de réservation, stockage d'autorité, suivi des permissions et événements.
- Capture Memex liée au projet et conservée avec le dossier confirmé.
- Lecture Memex HTTP, propositions et parcours de revue gouvernée.
- Diagnostic de reprise : état observé, fraîcheur et incertitudes visibles.
- Chargement ciblé des missions et du contexte ; mesures documentées séparément.
- Cockpit, calendrier, registre d'agents et outils de gouvernance existants conservés.

Les fonctions d'exécution et de revue restent soumises à leur configuration et à
leurs garde-fous. Un écran présent dans le code ne prouve pas qu'un compte est connecté.

## Ce qui a été qualifié, et les limites

Le dépôt compagnon documente un parcours isolé reliant HQ, stockage durable,
Memex, runner et proxy avec un **adaptateur simulé**. Le contexte confirmé et les
états ont été vérifiés après redémarrage du stockage. Le runner possède une suite
de 124 tests réussis sous Linux, incluant le budget temporel partagé.

**Encore à prouver :** une mission Claude authentifiée qui modifie réellement du
code depuis HQ, passe ses tests et une revue indépendante, puis fournit un aperçu
essayable. La connexion dédiée, le raccordement sécurisé des identifiants, la
publication approuvée du cadre Memex et l'activation opérateur restent à finaliser.
Antigravity reste prévu et non qualifié dans ce parcours. Les vérifications
synthétiques ne démontrent ni économies de tokens ni supériorité de performance.

Voir aussi :

- [Préparation OpenHands](docs/OPENHANDS_PREPARATION_UI.md)
- [Contexte Memex](docs/OPENHANDS_MEMEX_CONTEXT.md)
- [Permissions des outils](docs/openhands-tool-permissions.md)
- [Profil fournisseur](docs/OPENHANDS_PROVIDER_PROFILE.md)
- [Diagnostic de reprise](docs/OPENHANDS_RECOVERY_UI.md)
- [Mesures de chargement](docs/MISSION_LOADING_PERFORMANCE.md)

## Développement local

Prérequis : Node.js 22.x (contrainte du dépôt : `>=22 <23`) et npm 10 ou supérieur.

```sh
npm ci
npm run dev
```

Les variables disponibles sont décrites dans `.env.example`. Conserver les vraies
valeurs dans la configuration locale ou le gestionnaire de secrets du déploiement.
Les intégrations externes exigent leur propre configuration. Le mode local de
certaines fonctions n'est pas une preuve de connexion à Supabase ou aux modèles.

## Vérifications

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:joris
```

Le smoke Joris utilise le parcours local par défaut. Ne pas activer les écritures
externes pour une simple validation du dépôt. Les rapports de qualification
précisent leur périmètre ; les résultats ne constituent pas une garantie zéro bug.

## Façon de travailler

Un résultat utile par mission, avec périmètre, budget et critères d'acceptation.
Réutiliser les briques existantes ; automatiser les contrôles répétitifs ; fournir
aux agents le contexte pertinent. Un développeur ne valide pas seul sa livraison.
Les essais audacieux restent isolés et les reprises vérifient les effets existants.

Les fichiers de session navigateur, journaux locaux, dépendances et identifiants
ne font pas partie des sources à publier. Une publication GitHub ne déploie pas le VPS.

## Repères et historique

- [AGENTS.md](AGENTS.md) : règles de contribution.
- [SOUL.md](SOUL.md) : posture des agents.
- [Consolidation des dépôts](docs/REPO_CONSOLIDATION.md) : frontières du produit.
- [Ancien README, conservé comme historique](docs/HQ_README_BASELINE_2026-06-15.md).

Les anciens documents peuvent décrire des choix ou états antérieurs, notamment
Paperclip comme premier exécutant. Le plan et la liste de tâches ci-dessus fixent
la priorité actuelle ; les preuves datées déterminent ce qui fonctionne réellement.
