# Contribution durable HQ → Memex

Le transport de contribution est indépendant du transport de lecture Joris. Il exige `ORIA_ENABLE_MEMEX_PROPOSALS=1`, un workspace serveur explicitement lié et un handle `read_write` mono-namespace via `MEMEX_HTTP_PROPOSAL_HANDLE_FILE` (ou sa variante inline, jamais les deux). Son corridor ne permet que soumission et consultation de reçu. Aucun outil d'approbation ou de publication n'est appelé.

Le serveur impose le namespace et le tenant ; l'identité de contribution est celle du handle vérifié par Memex. Un UUID de requête reste stable pour une même intention. Memex conserve atomiquement le mapping `(namespace, sujet authentifié, requestId)` vers la proposition et compare la représentation canonique du payload. Une collision de payload est un conflit. Le statut retourné est celui de la proposition actuelle.

Un timeout après envoi est une issue inconnue. La consultation par requestId permet la réconciliation sans renvoi. Un résultat null signifie seulement qu'aucun reçu n'est retrouvé à cet instant ; il ne prouve pas qu'aucune opération en cours ne peut finir. Un éventuel nouvel essai doit donc garder le même identifiant. Aucun retry automatique.

Les identifiants et statuts des vingt derniers reçus sont conservés dans sessionStorage, pas les contenus. Cette commodité ne constitue pas un historique durable de l'application : fermer la session du navigateur peut faire perdre ces références, bien que les propositions restent dans Memex. Un futur index de contributions serveur sera nécessaire pour la revue complète depuis HQ.

`approved` ne signifie pas publié. La projection HQ conserve `publicationStatus=unknown` tant qu'aucune vérification du journal de publication n'est disponible. Les connaissances proposées ne sont pas ajoutées au graphe de lecture.

## Qualification

Le test inter-dépôts `Orchestrator/deploy/memex-pilot/hq-contribution-contract.mjs` utilise le service HQ réel, un gateway Memex HTTP signé et des bases SQLite temporaires. Il vérifie réception, réouverture, retry identique, conflit, isolation sujet et workspace. Il n'utilise pas les credentials runtime et ne publie rien.

Les tests du transport bornent délai, taille, scope et outils ; les tests de route couvrent session, origine, corps strict et paramètres. La qualification navigateur/VPS et les versions déployées sont consignées dans le dossier de déploiement Orchestrator. Les tests isolés ne remplacent pas cette qualification.

## Limites à traiter ensuite

- L'ancien UNIQUE(namespace,content) reste en place : un nouveau requestId pour un contenu déjà présent produit un conflit explicite.
- Le sujet authentifié doit rester stable lors de la rotation des credentials, faute de quoi ses reçus ne seraient plus retrouvés.
- Le pilote HQ est mono-propriétaire ; le sujet de service ne constitue pas une attribution individuelle multi-utilisateur.
- Revue humaine distante, contenu des propositions, journal d'approbation lié au payload et publication restent un chantier séparé. Ne pas contourner ces étapes par un handle administrateur transmis aux agents.
