# HQ constructeur : choix des briques et plan de qualification

Nomenclature corrigée suivant l'épellation utilisateur : **ORIA HQ**. Les chemins historiques de dépôts ne sont pas renommés par cette correction documentaire.

## Mandat opérationnel — priorité actuelle, 30 septembre 2026

**But : livrer un atelier de développement utilisable basé sur OpenHands, accessible dans ORIA HQ, puis lui confier progressivement la finalisation d'ORIA HQ.** L'atelier reste distinct du produit qu'il modifie. Memex fournit le contexte du projet ; AgentMemory reste une mémoire locale de développement.

### Objectifs et critères de sortie

1. **Prouver une mission réelle.** Une demande faite depuis HQ produit une modification utile sur une copie isolée, avec état visible, tests du résultat, revue indépendante et aperçu essayable. Une session ouverte ou un agent simulé ne satisfait pas ce critère.
2. **Prouver la maîtrise des incidents.** Un arrêt, une déconnexion ou un échec conserve le travail et les preuves ; avant reprise, les effets déjà réalisés sont vérifiés. Toute incertitude reste visible, sans succès inventé ni relance aveugle.
3. **Ajouter Antigravity.** Vérifier son accès autorisé, le transfert de contexte, l'exécution d'une tâche et la récupération du résultat avant de le présenter comme disponible. L'échec d'un connecteur supplémentaire ne remet pas en chantier le premier parcours fonctionnel.
4. **Confier une amélioration d'ORIA à l'atelier.** L'agent développeur produit un changement, un réviseur distinct le contrôle, puis une livraison contrôlée conserve une voie de retour arrière.
5. **Optimiser à partir des missions terminées.** Mesurer durée totale, consommation disponible, reprises et interventions humaines. Les données absentes restent inconnues. Comparer à périmètre et critères de qualité équivalents ; aucun pourcentage d'économie sans mesure.

### Règles simples d'exécution

- Une priorité critique à la fois ; paralléliser uniquement les tâches indépendantes qui réduisent le délai total.
- Chaque mandat précise résultat attendu, périmètre de fichiers, critères d'acceptation, budget et condition d'arrêt.
- Réutiliser OpenHands et les composants existants ; toute nouvelle couche doit résoudre un manque constaté.
- Scripts pour les contrôles répétitifs ; modèle adapté et contexte ciblé pour le travail qui demande un agent. Escalade seulement sur difficulté observée.
- Un développeur ne valide pas seul sa livraison. Tests et revue examinent les changements exacts proposés.
- Audace dans un environnement isolé : hypothèse, expérience bornée, mesure et décision de garder ou abandonner.
- Aucun essai supplémentaire sans question non résolue qu'il permet de trancher. Les tests simulés ne remplacent pas l'exécution réelle.
- Une interface compréhensible montre ce qui est prévu, en cours, bloqué, vérifié et essayable ; les explications détaillées sont accessibles à la demande.
- Un blocage nécessitant une autorisation explicite est signalé ; il n'est ni contourné ni masqué par des travaux périphériques.

**Jalon immédiat :** première modification réelle, vérifiée et essayable depuis HQ. La connexion Claude, la publication gouvernée du contexte Memex et le raccordement sécurisé du compte restent à finaliser. Ce mandat ne constitue aucune de ces autorisations et ne prétend pas que l'intégration est terminée.

## Revue croisée via les comptes connectés

Gemini, Claude Cowork et Muse ont reçu des demandes conceptuelles distinctes, sans sources privées, secrets ou accès au VPS. Ce sont des avis sur un résumé, pas un audit du code ni des intégrations de production. Leurs assertions non sourcées ne deviennent pas des faits.

Décisions retenues : qualifier d'abord chaque moteur sur un contrat fixe, puis tester la coordination et Memex séparément ; conserver une revue indépendante séquentielle ; montrer preuves datées et distinction entre essai et livraison ; attacher les corrections utilisateur à une version du plan.

Propositions écartées ou corrigées : ne pas fusionner tous les services dans un conteneur ; ne pas supprimer la copie de travail à l'annulation (préserver diff et preuves) ; ne pas promettre une reprise au point exact ni un plafond token strict sans support fournisseur ; ne pas lancer 45 essais d'emblée. Commencer par une qualification par chemin puis répéter les scénarios des finalistes, sans prétendre obtenir une certitude statistique. Aucun score de maturité chiffré tiré d'un résumé ne vaut audit. Les logs et le code restent accessibles en détail, même si l'écran initial parle simplement.

La connexion aux sites web permet ces consultations supervisées. Elle ne prouve pas qu'un service ou ses outils puissent être pilotés de manière fiable et persistante depuis notre VPS. Aucun connecteur de production n'a été créé par cette revue.

Décision de direction du 29 septembre 2026. Recherche GitHub vérifiée le 30 septembre UTC. Ce document remplace les hypothèses du plan précédent lorsqu'elles confondent le constructeur avec ORIA HQ.

## Produit et distinction essentielle

HQ doit devenir un assistant de développement : comprendre une demande, préparer un plan explicite, distribuer le travail, réaliser les modifications, vérifier le résultat et guider l'utilisateur. ORIA HQ sera un projet construit avec cet outil. Le dépôt actuellement nommé Oria.HQ contient des travaux réutilisables, mais son nom ne doit pas déterminer la séparation des produits. Avant tout déplacement de code, identifier les fonctions génériques du constructeur et les fonctions métier propres à ORIA.

Le succès est une application utilisable livrée à partir d'une demande, avec les preuves et les interventions humaines enregistrées. Ni un tableau de bord, ni un nombre de tests, ni une démonstration simulée ne suffisent.

## Recherche ciblée et choix

Les capacités ci-dessous sont documentées par leurs auteurs, sauf les constats locaux explicitement mentionnés. Aucune comparaison de performance entre moteurs n'a encore été exécutée. Licences identifiées par GitHub ; vérifier le fichier LICENSE du commit retenu et les dépendances avant incorporation.

| Dépôt | Utilité pour HQ | Décision |
|---|---|---|
| [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk) — MIT | API Python/TypeScript/REST, agents, outils, conversations, événements et espaces de travail locaux ou isolés | Premier candidat pour le moteur de développement ; prototype séparé, version figée |
| [Paperclip](https://github.com/paperclipai/paperclip) — MIT | Missions, équipes, adaptateurs et gouvernance | Conserver provisoirement comme responsable unique des missions ; déjà installé, exécution native encore à qualifier |
| [OpenHands automation](https://github.com/OpenHands/automation) — MIT | Automatisation du même écosystème | Comparateur de remplacement de Paperclip si nécessaire, pas un deuxième ordonnanceur à ajouter |
| [Cline](https://github.com/cline/cline) — Apache-2.0 | SDK Node, CLI, modes plan/action, checkpoints et approbations | Alternative de moteur si OpenHands échoue sur nos contraintes ; référence d'interaction |
| [LangGraph](https://github.com/langchain-ai/langgraph) — MIT | Exécution durable, état et interventions humaines | Référence et solution de repli ; ne pas ajouter un troisième moteur de flux au pilote |
| [SWE-agent](https://github.com/SWE-agent/SWE-agent) — MIT | Agent orienté résolution de tâches de développement | Référence historique : son README recommande désormais mini-swe-agent pour la suite |
| [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) — MIT | Agent minimal pour comparaison | Point de comparaison simple, pas le cockpit final |
| [Aider](https://github.com/Aider-AI/aider) — Apache-2.0 | Travail sur le code et intégration Git | Référence de boucle d'édition/revue, sans ajouter une dépendance de production maintenant |
| [Codewarden](https://github.com/mboyer1269-pixel/codewarden) — projet utilisateur | Mandats, coaching, conversations et centre de validation | Réutilisation sélective après audit, pas une seconde application à maintenir |

Lecture directe de Codewarden : `coach.rules.ts` produit des explications à partir de l'état de mission ; `agentClient.ts` appelle `/coach/run` ; `hermesRuntime.adapter.ts` décrit des capacités, sans implémenter à lui seul une connexion. La déclaration « live » ne constitue donc pas une preuve d'exécution. Aucun OpenHands trouvé sur la branche principale inspectée.

OpenHands SDK précise que son Agent Server exécute les conversations et que son dépôt automation possède le scheduling/dispatch. Cette frontière est utile : notre prototype doit remplacer ce dernier rôle par Paperclip, ou retenir automation à sa place, sans doublonner les deux. Cette compatibilité reste à implémenter et vérifier.

## Architecture candidate

Précision utilisateur : une seule application web ORIA donne accès à l'espace HQ constructeur, logiquement distinct. Le serveur conserve l'exécution et l'état lorsque le navigateur est fermé. Cela exige une qualification de déconnexion/reconnexion et d'authentification distante ; l'accès actuel via tunnel localhost n'est pas encore un accès web autonome depuis n'importe où.

Comparateur supplémentaire : Codex natif via SDK pour tâches programmatiques, ou App Server pour interaction riche. La [documentation officielle App Server](https://learn.chatgpt.com/docs/app-server) recommande le SDK pour jobs/CI et documente historique, approbations et événements pour les clients riches. Elle marque le transport WebSocket expérimental et non pris en charge en production ; ne pas exposer directement un listener au navigateur/public. Prototype via backend privé et transport local, version figée, sans prétendre que cette précaution rend une API expérimentale stable. Installer l'application de bureau dans un conteneur ne transfère pas automatiquement ses outils et n'est pas la voie retenue pour l'orchestration serveur. Le choix final reste soumis à l'essai commun, pas à une nouvelle accumulation de composants.

1. Interface HQ : demande, plan, tâches, résultats, décisions et explications. Aucun succès simulé.
2. Contrôle des missions : un seul responsable des affectations, limites, identités d'exécution et reprises. Paperclip candidat actuel.
3. Exécutants interchangeables : OpenHands et CLI natifs via des adaptateurs distincts. Ne pas faire appeler Claude CLI à l'intérieur d'OpenHands sans besoin démontré.
4. Memex : références, décisions, corrections et provenance par projet. Aucun historique complet envoyé systématiquement aux agents.
5. Validation indépendante : copie du changement, tests et aperçu isolés, sans domicile fournisseur ni données opérationnelles. Réutiliser le pipeline Node22 déjà qualifié.

Chaque adaptateur doit annoncer ses capacités réellement prouvées : lancer, consulter, annuler, reprendre, récupérer le diff et la consommation. Une fonction absente est marquée non prise en charge. Toute exécution conserve missionId, attemptId, identifiant du fournisseur, référence Git de départ et artefacts. La réussite exige des critères validés ; une réponse perdue déclenche une consultation, pas un nouveau lancement aveugle.

## Plan exécutable et portes de sortie

| Lot | Travail | Responsable | Preuve exigée |
|---|---|---|---|
| 1. Contrat et périmètre | Séparer constructeur/ORIA ; figer mission test, baseline Git, critères, limites et moteurs candidats | Architecte | Une fiche identique utilisable par chaque candidat ; aucun transfert de code métier sans justification |
| 2. Qualification OpenHands | Épingler SDK/Agent Server, vérifier licence, dépendances, authentification, événements et workspace isolé | Ingénieur exécution | Installation reproductible ; un changement réel borné ; arrêt vérifié ; erreurs remontées |
| 3. Comparaison | Même petite fonction avec OpenHands et le runner natif ; valider les deux diffs avec le même pipeline | Exécution + réviseur | Résultats, durée, consommation connue/inconnue et interventions ; expliquer l'écart de modèles si différents |
| 4. Choix d'architecture | Retenir un moteur principal et un propriétaire de mission | Architecte | Décision écrite fondée sur les résultats ; retirer les chemins redondants du plan |
| 5. Mission intégrée | Demande HQ → plan → tâche → modification → tests → revue → aperçu | Intégration | Parcours réel utilisable depuis l'interface, événements persistants et aucun statut inventé |
| 6. Robustesse | Interruption, timeout, réponse perdue, contexte corrigé et conflit entre deux modifications | Validation | Pas de double effet ; reprise expliquée ; arrêt constaté ; travail préservé ; refus des accès hors projet |
| 7. Interface pédagogique | Adapter les concepts utiles de Codewarden au parcours réel | UI/UX | Utilisateur capable d'identifier objectif, blocage, choix et résultat sans explication externe ; mobile et clavier vérifiés |
| 8. ORIA HQ | Confier une première fonction métier limitée au constructeur | Équipe pilotée par HQ | Fonction essayable, tests, revue indépendante et livraison réversible ; élargissement progressif |

Première mission comparative : ajouter une présentation d'état d'exécution distinguant état demandé et état observé, avec tests. Contrat d'événements figé fourni aux deux candidats pour éviter une comparaison dépendant d'API inventées. Cette mission ne remplace pas le test d'intégration réel du lot 5.

La décision ne repose pas sur un score arbitraire unique. Exigences éliminatoires : séparation des projets, preuves du changement, erreurs visibles, arrêt et coût maîtrisables. Ensuite comparer tâches acceptées, reprises, temps humain et coût total. Un premier passage est une qualification, pas un benchmark statistique ; élargir aux missions de référence avant toute affirmation de supériorité.

## Abonnements, tokens et fonctionnement de l'équipe

Support d'un modèle et utilisation d'un abonnement ne sont pas équivalents. Le démarrage documenté du SDK OpenHands utilise une clé LLM ; nous n'avons pas établi qu'il consomme les abonnements Claude/Codex/Cursor/Antigravity existants. Vérifier le chemin officiel de chaque accès avant de compter ses quotas. Si aucune voie approuvée n'existe, comparer avec un accès API explicitement autorisé ou marquer ce candidat non exécutable dans le budget actuel. Aucun contournement OAuth ni basculement facturé automatique.

Découverte source importante : au commit `23fc50cd6d65f65513158dcebf38b26bf74c2ede`, [ACPAgent](https://github.com/OpenHands/software-agent-sdk/blob/23fc50cd6d65f65513158dcebf38b26bf74c2ede/openhands-sdk/openhands/sdk/agent/acp_agent.py) prévoit notamment la sélection du mode ChatGPT via codex-acp et du mode OAuth personnel via Gemini CLI. Il ne faut donc pas classer OpenHands comme uniquement API. Cette présence dans le code ne valide ni nos comptes ni la portabilité de leurs connexions. Le même code indique des modes automatiques `bypassPermissions` pour Claude et `agent-full-access` pour Codex : examiner les modes disponibles, les contrôles et les frontières du conteneur avant toute exécution. Ne pas affaiblir nos protections existantes pour faire fonctionner une démonstration. Le premier prototype doit examiner ACP autant que l'agent LLM natif ; aucun secret existant n'est copié pendant la recherche.

Un développeur puis un réviseur ; deux travaux parallèles seulement si les fichiers et dépendances le permettent. Mandat compact : objectif, limites, critères, références, commandes de validation et format du résultat. Chargement des skills à la demande, versionnés et examinés avant usage. Scripts pour les contrôles déterministes. Au plus une reprise corrective automatique lors du premier pilote, puis diagnostic humain/chef ; limites révisées selon les mesures.

Deux limites supplémentaires ont été vérifiées dans le [guide ACP officiel](https://github.com/OpenHands/docs/blob/main/sdk/guides/agent-acp.mdx) : les demandes de permission sont automatiquement approuvées par le pont ; les outils, `mcp_config`, condenser et critic du SDK ne sont pas acceptés par ACPAgent. Pour ce chemin, Memex et les outils doivent être configurés du côté de l'exécutant ACP. Une interface d'approbation HQ ne protège donc pas automatiquement chaque commande interne. Cette qualification est éliminatoire avant intégration : soit une frontière d'exécution acceptable est démontrée, soit on retient un autre chemin. Le prototype ne reçoit aucun accès aux services opérationnels.

## Interface et pédagogie

Accueil : « Qu'est-ce que tu veux construire ? ». Projet : repères à gauche, étapes et artefacts au centre, chef et décisions à droite. Détails accessibles sans cacher les erreurs. Chaque étape montre objectif, résultat attendu, état observé et preuve. « Explique-moi cette étape » utilise d'abord une explication stable liée à l'événement ; un modèle n'est appelé que pour une question personnalisée. « Essayer le résultat » ouvre un aperçu réel ; commentaires liés à l'élément et à la version. Pas d'animation ni de pourcentage présentant une activité fictive.

## Ce qui est déjà disponible, et ce qui manque

Disponible et testé : export source vérifié, baseline isolée, pipeline sans réseau ni volumes opérationnels, 3 934 tests passants et deux ignorés, typecheck/lint/build/smoke. Mission durable dans HQ et fondations Memex existantes. Cela ne prouve ni l'orchestration native, ni la compatibilité OpenHands, ni la livraison d'ORIA.

Prochaine action : qualification technique du SDK OpenHands et contrat de la première mission, avant nouvelle extension du cockpit. La recherche historique est arrêtée à la demande de l'utilisateur. Le travail documentaire présent n'installe aucun nouveau service et ne change pas l'instance active.
