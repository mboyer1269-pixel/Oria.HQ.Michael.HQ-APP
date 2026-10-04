# Revue humaine Memex depuis HQ — pilote désactivé par défaut

## Configuration runtime

- `ORIA_ENABLE_MEMEX_REVIEW=0` : activation explicite indépendante de la lecture et des contributions.
- `MEMEX_REVIEW_ENDPOINT` : origine HTTPS exacte, sans slash final/chemin/query; HTTP seulement loopback explicite.
- `MEMEX_REVIEW_HQ_WORKSPACE_ID` : projet HQ exact, namespace dérivé serveur.
- `MEMEX_REVIEW_TOKEN_FILE` : fichier absolu non symlink lu à chaque opération, token dédié `opr1.<43base64url>` ; aucun fallback vers amh1 ni token MCP. Aucun secret dans cette documentation.
- `ORIA_HQ_PUBLIC_ORIGIN` : origine navigateur exacte derrière proxy; aucun Host/Forwarded utilisé comme autorité.

Schema déclaré dans server-env; capacité `memex_operator_review` dans runtime-capability-inventory.

## Parcours

Le bouton Examiner cette proposition du reçu ouvre la revue préremplie. Une lecture explicite affiche le contenu, la provenance, la confiance et les risques puis le payload complet dans un accordéon. Le service refuse les champs inconnus ou une empreinte non reproductible, plutôt que masquer des effets possibles. Les suggestions JSON sont conservées intégralement.

Le propriétaire coche l’examen complet puis approuve ou rejette. Une lecture unique du User Supabase fournit simultanément l’autorisation et reviewerId réel. Le navigateur ne peut fournir ni reviewerId ni namespace ni technicalPrincipal. Le backend distinct opérateur reçoit snapshot/decision en POST, réponses bornées 512KiB, 5s, sans redirects/retry.

La décision lie proposalId, hashVersion1, expectedPayloadHash, decisionId et approve/reject. Après réponse perdue, le navigateur conserve ce tuple sans contenu dans sessionStorage et n’offre que reprise explicite de la même décision. Conflit explicite permet de fermer ce suivi puis recharger; aucune décision contraire automatique. JSON de suivi corrompu bloque la reprise.

L’enregistrement de l’approbation n’est jamais présenté comme publication. Aucun endpoint de publication n’est appelé. Les reçus distinguent acteur humain relayé et principal technique du canal opérateur.

## Validation et limites

Tests locaux de scope/auth/origin, corps falsifiés, payload/hash modifiés, snapshot étendu non pris en charge, credential agent refusé, conflict sans retry, stockage décision corrompu. Une qualification opérateur réelle et UI authentifiée reste à rattacher au lot déployé; les tests synthétiques ne constituent pas cette preuve. Le journal des décisions reste dans Memex, aucune deuxième base HQ.
