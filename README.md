# ORIA HQ — atelier de développement et centre de pilotage

État de cette copie d'intégration au **3 octobre 2026**. Le code publié, les essais isolés
et le déploiement actif sont des états différents : ce dépôt ne prétend pas
qu'une mission autonome complète est déjà opérationnelle.

## Notre objectif

### Avancement de la copie d'intégration

Point courant : les migrations d'approbation 0015 et 0030 sont installées dans la base configurée. Le RPC de décision est réservé au serveur ; le déclencheur refuse les nouvelles étapes de démarrage après révocation. Les essais PostgreSQL isolés couvrent décisions concurrentes et rollback du journal. La connexion Claude est lisible dans le candidat VPS isolé, avec métadonnées montées explicitement. La première mission réelle reste à démontrer.

Le dossier v3 lie désormais le modèle natif demandé au profil et à l'approbation. Le reçu distingue ce choix, sa confirmation ACP, les modèles observés et la consommation disponible, sans additionner les mesures de périmètres différents. Le contrôle correspondant du runner est encore en intégration : les anciens candidats ne doivent pas servir de preuve de ce comportement. Les validations ci-dessous décrivent leurs étapes respectives, et non une qualification de production complète.

- Le catalogue OpenRouter/Nara est consultable dans `/hq/runtime`, avec pagination par fournisseur, date de vérification et actualisation à la demande ou à l'ouverture si périmé. Une entrée ne constitue pas une autorisation d'exécution ; les accès et quotas non attestés restent inconnus.
- Depuis le chat HQ, « Préparer une mission de développement » transfère l'objectif vers le formulaire existant. Le transfert reste dans l'onglet, séparé par workspace, expire après quinze minutes et est consommé à la lecture. L'utilisateur complète et enregistre explicitement le brouillon ; aucune approbation automatique.
- Le reçu enregistré et le plan de mission donnent accès au dossier exact, contrôlé par workspace et mode.
- Le brouillon non envoyé conserve ses quatre champs dans cet onglet, par workspace, pendant 24 h après modification. Navigation et actualisation vérifiées dans le navigateur pour titre/objectif ; aucune soumission automatique. Les reçus restent séparés.
- Validation locale : 148 tests catalogue/routeur et 42 tests transfert/reprise réussis ; TypeScript, lint ciblé et build complet sous Node **22.23.2** réussis. Le build sous Node 25 avait échoué ; utiliser la version 22 prévue par `engines`.
- Dernière passe : 45 tests catalogue (prix partiels et modèles Nara dédoublonnés), 48 tests formulaire/transfert/reprise, TypeScript, build complet et smoke Joris local réussis. Lint global : 0 erreur, 8 avertissements. Navigation Mémoire/Agents et largeur 390 px contrôlées ; parcours mobile complet et appareil réel encore à qualifier.
- Restent à démontrer : accès fournisseur réel, mission Hermes → HQ → OpenHands et aperçu du résultat. Ces changements sont locaux, pas un déploiement. Le redesign reste soumis à validation visuelle.
- Raccordements du 3 octobre : le chat transmet le compte/modèle/révision au contrôle serveur et au routeur budgétaire existant. Les qualifications doivent provenir d’une attestation serveur réelle (`ORIA_HQ_CHAT_CAPABILITIES_FILE`), encore absente ; aucun compte n’est rendu utilisable sur la seule présence au catalogue. Les tokens et le modèle observés reviennent dans la réponse ; coût non mesuré = inconnu.
- Le canal lifecycle OpenHands reçoit désormais un export de fichiers sélectionnés lié au lancement, mission, workspace, commit et empreinte. Il conserve le résultat existant, refuse un rejeu divergent et ouvre les différences en texte dans le dossier. La collecte est opérateur, pas automatique ; ce reçu ne constitue ni une validation indépendante ni un aperçu exécutable.
- Validation de ces raccordements : 29 tests identité/chat/résultat réussis, un test transitif Python initialement ignoré puis exécuté avec succès avec le runner configuré (9/9 tests résultat), 14 tests projection/rendu réussis. TypeScript, build Node 22 et smoke Joris local passent ; lint global : 0 erreur, 8 avertissements. La qualification opérationnelle du registre est décrite au point suivant.
- Migration 0029 d'abord qualifiée sur PostgreSQL 16 isolé, puis appliquée au projet Supabase configuré le 3 octobre. La véritable sonde configurée lit la connexion du candidat VPS et persiste son identité via PostgREST : deux processus de vérification réussis, une seule identité conservée, révocation de configuration vérifiée. RLS forcée, lecture/écriture client interdites. Le montage explicite des métadonnées Claude reste à intégrer au lanceur ; aucune mission réelle réussie n'est encore démontrée.
- Suite du 3 octobre : la sonde Claude est maintenant raccordée au registre d'identité opaque par workspace ; 77 tests ciblés rejoués localement passent. La connexion officielle de l'abonnement est confirmée dans le conteneur de login, mais le stockage et le candidat isolé restent en qualification : aucune mission réelle n'est encore démontrée.
- Le correctif des surcharges Cursor est intégré : les composantes tarifaires connues restent consultables, les surcharges gardent leurs unités et les valeurs inconnues ne deviennent pas zéro. 47 tests catalogue/consultation rejoués localement passent, sans appel modèle. Les tarifs avec overrides restent inconnus ; aucun total artificiel ni autorisation de lancement n'est ajouté.
- Vérification globale après correction des inventaires de gouvernance et du scanner de configuration : 4 398 tests passent, 0 échec, 6 ignorés (4 404 au total). TypeScript, build Node 22 et smoke Joris local passent ; lint : 0 erreur, 8 avertissements. Cette preuve locale ne qualifie pas les appels fournisseurs ni le déploiement VPS.

Les résultats datés du 1 octobre ci-dessous sont historiques et ne remplacent pas ces limites.

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
