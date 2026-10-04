# Audit architecture HQ — 2026-09-29

Revue statique de la branche codex/hq-mission-dossier, arbre déjà modifié par plusieurs agents. AGENTS.md et SOUL.md lus. Aucun secret/env réel consulté, aucun LLM appelé. Ce rapport distingue comportements prouvés par source et qualification runtime non réalisée. Accueil/navigation/agenda/ventures sont revus en parallèle par les autres agents.

## Carte actuelle

- Auth : Supabase getUser puis propriétaire autorisé par ID ou email (`src/server/auth/owner.ts:25,34,87,108`). Pages protégées individuellement, routes JSON via requireOwnerApiSession. Pas encore un modèle de membres multi-workspaces.
- Workspace : `src/core/workspace-context.ts:34` résout toujours le workspace par défaut ; identité de stockage configurée dans `src/server/auth/user-context.ts:43`. La production refuse le fallback dev sauf opt-in explicite.
- Missions : dépôt Supabase filtré workspace_id, erreur remontée plutôt que fallback silencieux (`src/server/missions/mission-repository.ts:13`). Brouillons locaux distincts (`mission-draft-repository.ts:6`) ; le contrôle indique stockage session ou Supabase selon voie sélectionnée (`mission-draft-control.ts:239,268`).
- Joris : `/api/joris/chat` protège l'accès puis appelle brain. Règles/intents, mémoire locale et enrichissement Memex conduisent à une réponse déterministe ou à un appel modèle (`brain.ts:314,682`). La génération utilise les fournisseurs API configurés, pas implicitement les abonnements CLI.
- Mémoire : trois surfaces différentes : Memory Vault HQ en RAM, fichiers repository memory/, Memex externe en lecture scoped. `/hq/memory` affiche surtout les deux premières ; ce n'est pas une vue unifiée du stockage Memex.
- Orchestrateur : `/api/orchestration/missions` lit Paperclip après binding serveur workspace/company. Le handler refuse query overrides, ne transmet pas les erreurs upstream brutes et utilise private/no-store (`paperclip-read-handler.ts:14–36`). Cette lecture n'est pas une commande de dispatch.

## Constats prioritaires

1. **P1 corrigé dans ce lot — perte des écritures mémoire en production.** `memory-vault-repository.ts:177–195` crée une entrée par push dans un tableau module ; `/api/memory` retournait200 sans persistance. L'UI avertissait déjà in-memory, mais l'API acceptait toujours l'action en production. Ajout refus503 après authentification pour propose/approve/reject tant que cette surface ne dispose pas de stockage durable. Pas de migration inventée. Test route production couvre trois actions et maintien401 avant le garde.

2. **P1 corrigé dans ce lot — confiance du contexte surévaluée.** `brain.ts:314–322,682` mélange des sources puis les fournit au générateur ; `memex-context-source.ts:161` décrit explicitement Memex comme untrusted advisory. Pourtant `joris-reply-generator.ts:38` annonçait tout le bloc comme vérifié. Le préambule conserve maintenant les niveaux de confiance, interdit de considérer advisory comme instruction ou fait vérifié. Test inspecte le prompt envoyé à un fetch simulé.

3. **P2 corrigé — acteur d'approbation mémoire.** La route utilise désormais getAuthenticatedActorId et refuse401 si la session ne fournit plus d'acteur. Le test exécute la vraie route avec identité configurée différente de la session et identités client falsifiées : seule la session est enregistrée ; aucune mutation sans acteur.

4. **P2 restant — périmètre workspace affiché plus large que celui réellement garanti pour les fichiers.** `/hq/memory/page.tsx:117–126` charge tous les fichiers via loadFileVaultEntries() sans workspace puis demande le learning report de michael-hq en dur. `memory-file-vault.ts:46` lit le dossier repository global. Pas de fuite multi-tenant démontrée : le produit demeure single-owner/default-workspace. Mais annoncer une isolation complète de cette vue serait incorrect dès l'ajout d'un deuxième workspace. Conserver la restriction single-workspace et filtrer/partitionner avant expansion.

5. **P2 corrigé — statut des profils agents.** Les compteurs de /hq/agents sont renommés « Profils activés », avec précision que les statuts configurés ne prouvent pas la connexion des fournisseurs. Aucun probe ni état runtime inventé.

6. **P2 produit — coûts conversationnels peu observables.** `joris-reply-generator.ts:55` autorise1024 tokens sortie, délai20s ; `llm-json-provider.ts:90` essaie les fournisseurs dans l'ordre de fallback. Le résultat du générateur ne retourne que texte/modèle, pas usage/coût. Ce n'est pas une preuve d'absence de tous budgets système, mais cette surface ne donne pas une comptabilité exploitable pour optimiser les abonnements. Afficher source modèle/API et consommation inconnue plutôt que gratuite ; collecter usage mesuré avant routage économique.

## Cohérence à préserver

Les écritures RAM et brouillons ne doivent jamais porter une promesse de sauvegarde durable. L'état Paperclip read-only, le registre de profils HQ et l'état de connexion réel doivent rester distincts dans l'interface. Une connexion propriétaire réussie ne prouve pas que Memex, le stockage Supabase ou tous les runtimes sont actifs. Le fail-closed des bindings et les sources/advisory explicites sont des bases utiles à conserver.

## Validation et limites

Changements bornés : deux P1, attribution authentifiée, fraîcheur des seeds et libellés agents. Derniers tests mémoire ciblés :14 réussis, aucun appel réel. Le test de provenance du générateur avait également réussi lors du lot P1. Typecheck et smoke:joris réussis ; lint sans erreur, cinq avertissements préexistants. Build global coordonné avec la tâche principale après les autres lots. Ne pas considérer ce rapport comme preuve d'un build runtime réussi. Aucune modification de secrets, aucun commit/push, aucune activation fournisseur. Les corrections UI parallèles peuvent faire évoluer les numéros de ligne ; les références nommées identifient les points examinés.

## Fraîcheur des seeds

**P2 corrigé.** Les cinq seeds conservent leur date source createdAt comme updatedAt au lieu de prendre la date du démarrage. Le compte de smoke18/18 périmé est retiré ; la règle de persistance précise que le Vault HQ est temporaire, perdu au redémarrage et fermé en écriture production. Le test compare chaque date source et rejette le vieux compte. Ces seeds restent des documents historiques, pas une mesure actuelle de santé runtime.


## Intégration et parcours utilisateur

Le lot intégré remplace l’accueil technique et ses états statiques par objectif, assistant, propositions, missions réelles filtrables et dernière activité. Les inventaires restent dans leurs pages dédiées. Un journal détaillé propriétaire est accessible à `/hq/activity`; les heures du journal et de l’accueil utilisent Toronto. La mémoire retrouve le même cadre de navigation et un sélecteur accessible ouvre les connaissances du graphe. La palette conserve le focus dans le dialogue et restaure le focus à la fermeture. Le badge assistant ne prétend plus une disponibilité mesurée.

Le rendu Cash Action Review ne déclenche plus de génération LLM, y compris en cas d’erreur de lecture. Les dépendances générateur désormais utilisées uniquement par un smoke manuel sont classifiées hors runtime. Le transfert Paperclip et les transports de lecture sont explicitement inventoriés, sans activer ces intégrations. Agenda et brief partagent une fenêtre serveur Toronto de quatorze jours, filtrée avant limite.

### Vérification intégrée

- Suite complète : 3 899 réussites, 0 échec, 2 intégrations Memex optionnelles non exécutées.
- Typecheck, lint et build réussis ; lint conserve cinq avertissements préexistants.
- Smoke Joris réussi sans écriture Supabase ; tests du journal réussis après harmonisation du fuseau.
- VPS privé : builds Linux réussis, connexion propriétaire dans le navigateur confirmée, dépendances Supabase auth/missions/ledger accessibles. Aucune migration ni création de données de mission pendant cette revue.
- Navigateur : exemple remplit le champ sans envoi, filtre Brouillons, agenda déplié sans anciens événements, palette vers Mémoire, sélection de connaissance, suivi Paperclip affichant honnêtement désactivé, journal réel et Cash Action Review vide sans génération.
- Affichage contrôlé à 390 et 1 440 pixels ; débordement d’en-tête mobile corrigé. Pas d’appel de fournisseur IA de test.

### Limites restantes et ordre recommandé

1. Raccorder une seule source durable de mémoire, avec publication et provenance communes, avant de réactiver l’écriture de la page mémoire. La vue actuelle ne remplace pas Memex Core.
2. Qualifier une mission avec un exécuteur réel, puis ajouter le second : les profils déclarés ne prouvent ni authentification, ni disponibilité, ni quota.
3. Mesurer consommation réelle, durée et résultat par mission avant d’optimiser le routage des abonnements.
4. Étendre le modèle workspace et partitionner le vault fichiers avant un usage multi-espace. Ne pas présenter le mono-propriétaire actuel comme une plateforme multi-tenant terminée.

Cette revue couvre les principaux parcours, frontières de données et effets du code ; elle ne certifie pas l’absence de tout défaut. Aucun commit ni push réalisé. L’objectif global Memex/HQ reste inachevé.
