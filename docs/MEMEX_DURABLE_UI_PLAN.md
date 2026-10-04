# Raccordement durable de la mémoire HQ à Memex

> Mise à jour 30 septembre 2026 UTC : consultation et soumission idempotente sont désormais implémentées et qualifiées sur le pilote privé. Voir `MEMEX_CONTRIBUTION_CONTRACT.md` et le rapport Orchestrator `deploy/hq-pilot/MEMEX-CONTRIBUTION.md`. Le texte ci-dessous conserve l'audit initial ; les absences de reçu/requestId y sont historiques. La revue/publication distante reste à construire.

Audit de code du 29 septembre 2026. Proposition de découpage, aucune activation ni nouvelle écriture runtime effectuée.

## État constaté

- `src/app/hq/memory/page.tsx` lit le vault en processus, fusionne les fichiers `memory/`, construit le graphe local et affiche les propositions locales. Ce chemin ne lit pas Memex. Son rapport learning-loop utilise encore `michael-hq` explicitement.
- `src/server/memory/memory-vault-repository.ts` conserve un tableau module-scoped initialisé avec des seeds. Ces entrées ne prouvent ni une publication Memex ni une conservation après redémarrage.
- `src/app/api/memory/route.ts` accepte propose/approve/reject avec session propriétaire et workspace serveur. Il refuse les écritures en production. En développement, propose force author=human et produit directement verified : cette sémantique ne doit pas être reprise pour une contribution Memex.
- `MemoryVaultEntry` contient type décision/SOP/note/source/doc, trustLevel verified/proposed/draft, author, sourceRef, approvedBy et dates. Ce n’est pas le contrat Entity de Memex. Ne pas effectuer de conversion directe de confiance.
- `src/server/mcp/memex-http-transport.ts` fournit déjà une lecture MCP bornée à 5 secondes et 512 KiB, sans redirection ni retry, avec endpoint fixé serveur et handle signé read_only mono-namespace. `workspaceIdToMemexNamespace` définit le namespace canonique. Le transport refuse tout outil d’écriture.
- Le test réel antérieur qualifie le module backend HQ vers le Memex VPS avec une donnée synthétique. Il ne qualifie pas la page mémoire déployée, ni un parcours de contribution.

## Contrat Memex réellement disponible

Sources : dépôt canonique `C:/Users/micha/Documents/memex-core`, `src/mcp/tools.ts`, `src/mcp/access.ts`, `src/mcp/capabilities.ts`, `src/graph.ts`, `src/intake/index.ts`, `src/intake/publication.ts`, fixture MCP des outils.

`agentmemory_graph_query` retourne un tableau JSON dans content[].text. Paramètres : namespace obligatoire, entityType optionnel, limit plafonné à 50. Les entités courantes sont filtrées côté graphe. Pas de curseur ni de tri explicite dans cette requête : ne pas présenter ces 50 résultats comme la totalité ou les plus récents.

Entity expose id, type, namespace, name, properties, source, originId, sourceHash, confidence et dates de validité/observation/création/modification. Plusieurs champs sont optionnels. `properties.status` ou la valeur confidence ne constituent pas une approbation indépendante. Une mémoire publiée sans suggestedEntities devient type Memory, id `publication:<proposalId>`, avec properties.content/publicationId et originId. Ce sont des conventions observées, pas un schéma obligatoire pour toutes les entités.

`agentmemory_submit_proposal` est disponible en remote avec accès read_write, tenant strictement égal au namespace. Le sujet authentifié remplace proposedBy et sourceClient. content est requis; suggestions/provenance sont optionnelles. Le retour MCP actuel est seulement l’ID texte, même si submitProposal interne dispose de status/warnings. Aucun outil MCP de consultation des propositions, de revue ou de statut de publication n’est exposé par la fixture actuelle.

Intake utilise les statuts proposed, quarantined, approved, rejected, publishing, promoted. Publication durable et journal existent déjà dans Memex (`publishApprovedProposal`); ne pas dupliquer cette machine dans HQ. Le vault filesystem remote est volontairement interdit faute de contrôle d’accès projet.

## Tranche 1 — consultation réelle, réalisable avec les contrats actuels

1. Nouveau service serveur HQ `src/server/memory/memex-vault-read.ts` : résolution du binding HTTP existant, appel graph_query, fermeture du transport en finally, validation stricte des résultats avant projection. Refuser chaque namespace étranger plutôt que l’afficher.
2. Projection dédiée (pas de conversion forcée en MemoryVaultEntry) : identifiant, titre éventuel, type natif, texte borné, provenance, dates connues, namespace, source=memex, état de validation explicitement inconnu lorsque non prouvé. Écarter propriétés arbitraires et HTML actif. Conserver les références Memex, sans copies persistées HQ.
3. Route GET propriétaire, workspace résolu serveur, paramètres limités au filtre autorisé, aucun endpoint/handle/namespace client. États disabled, unconfigured, workspace_unbound, unavailable et ready-empty distincts.
4. Page mémoire : panneau « Mémoire durable Memex » avec lecture/actualisation manuelle, provenance et avertissement de résultat plafonné; corpus local/fichiers séparé et nommé comme tel. Ne pas mélanger leurs totaux ni leurs badges de confiance.
5. Ne pas alimenter le graphe UI avec des liens inventés : graph_query ne fournit que les entités. Les relations demandent un contrat séparé vérifié.

## Tranche 2 — proposer, sans publier automatiquement

Précondition : compléter d’abord le contrat Memex de reçu/statut. Le MCP actuel renvoie un ID sans état, donc HQ ne peut pas annoncer « proposition acceptée » ou « publiée ». Un timeout peut aussi laisser une proposition effectivement enregistrée.

- Ajouter côté Memex un reçu structuré versionné (proposalId, namespace, état réel, warnings bornés) et une consultation mono-namespace de proposition/publication. Réutiliser intake_proposals et memory_publications, pas une nouvelle base HQ.
- Définir dans Memex une clé de requête durable avec conflit si payload différent, et une recherche de reçu après issue ambiguë. La déduplication actuelle de submitProposal n’est pas un contrat de retry client : le handler MCP n’accepte pas de requestId.
- HQ crée un service de contribution distinct du transport read_only. Handle read_write séparé, opt-in explicite, scope mono-projet; ne jamais élargir l’allowlist du client de lecture Joris.
- POST propriétaire + contrôle Origin cohérent avec dispatch, acteur de session, limites corps/délai, titre200/content8000/tags20 au maximum pour conserver les limites UI actuelles. Namespace/tenant imposés serveur. Métadonnées utilisateur ne deviennent pas identité authentifiée.
- Conserver type HQ dans une propriété dédiée proposée (ex. hqKind), titre dans name, texte dans content et sourceRef dans une provenance structurée à convenir avec Memex. Ne pas inventer des types ontologiques avant validation du contrat publication.
- Retour UI : contribution reçue, en attente de revue, rejetée, publication en cours ou publiée, exclusivement selon le statut distant. Sur timeout : issue inconnue, consultation du reçu; aucun renvoi automatique.

## Tranche 3 — statut et publication gouvernée

Commencer par consulter le statut de publication et ses références d’entités; l’approbation peut rester opérateur Memex. « Publiée » exige l’état promoted et un journal de publication complete cohérents; approved seul ne suffit pas. Les commandes approve/reject de l’ancienne route locale ne doivent jamais être redirigées silencieusement vers une publication distante. Une éventuelle revue distante nécessite son propre droit/contrat audité.

Après consultation validée, raccorder Joris et la page à la même source durable tout en conservant leurs politiques différentes : la page peut inspecter une proposition; le contexte agent ne doit pas la traiter comme connaissance publiée.

## Tests nécessaires

- Lecture : refus auth, workspace étranger, handle expiré, endpoint interdit, erreur HTTP/MCP, timeout, taille, UTF-8/JSON malformé; tableau d’entités invalide et namespace discordant.
- Projection : champ absent reste inconnu; confidence/status arbitraires ne créent aucun badge vérifié; source/type/texte hostiles restent données; 50 résultats n’est pas un total.
- UI : loading, disabled, erreur, vide et succès distincts; relecture sans mutation; corpus locaux clairement séparés; aucune fuite de handle/URL interne.
- Contribution : identité et scope imposés, Origin refusé, collision de clé/payload, double clic, retry après crash/timeout réconcilié, état rejeté ne devient pas succès, revue d’une autre namespace interdite.
- Qualification réelle finale : créer une proposition synthétique, retrouver son reçu après redémarrage, publication opérateur puis lecture HQ; vérifier absence dans l’autre projet. Tester aussi la page authentifiée déployée. Ne pas substituer des mocks à cette preuve.

## Décision recommandée

Implémenter la tranche 1 maintenant. Conserver le verrou de production de l’écriture locale. Coordonner ensuite l’extension minimale de reçu/statut/idempotence dans Memex avant d’activer un formulaire durable. Aucun token ni URL privé dans cette note; aucun changement de configuration nécessaire pour cet audit.
