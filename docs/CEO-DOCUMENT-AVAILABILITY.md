# CEO Brief — disponibilité documentaire

Base `20392e34aa2a011b1d773ed2c672b1c34409adfd`, branche locale `builder/ceo-document-availability-local`.

## Contrat

Le contrat `DocumentSourceObservation` distingue une observation complète de la fixture locale d’une observation indisponible :

| status | reason | totalCount | Sens |
|---|---|---|---|
| available | null | nombre, dont 0 | Tableau intégralement lu et valide |
| unavailable | disabled | null | Garde production : aucune lecture |
| unavailable | missing | null | Fichier absent (ENOENT) |
| unavailable | read_error | null | Lecture échouée |
| unavailable | invalid_data | null | JSON, tableau ou entrées invalides |

`source` vaut toujours `local_fixture`. La complétude est portée par le discriminant : available signifie toutes les entrées valides ; un tableau contenant une entrée invalide devient entièrement indisponible. Aucun comptage partiel n’est présenté comme total complet. `byHat`, `recent` et `recentFilenames` restent vides si indisponible ; ils ne constituent alors aucune preuve d’absence.

Seule une lecture réussie du tableau vide produit zéro. Les exceptions, chemins et extraits de données ne sont pas transmis dans le contrat ou les logs du lecteur. Le chemin statique et la garde production restent inchangés ; le flag unsafe existant n’est ni activé ni élargi.

## Consommateurs et compatibilité

- `/api/brief/ceo` conserve `{ brief }`, la garde propriétaire et les clés existantes. `documents.totalCount` devient **nullable**, avec `status`, `reason` et `source` obligatoires. C’est une évolution sémantique que tout client externe doit traiter ; aucune compatibilité universelle avec des clients inconnus n’est annoncée.
- Les consommateurs du dépôt ont été vérifiés : construction serveur, panneau HQ, résumé `brief.generate` du brain. Le résumé annonce l’indisponibilité, y compris lorsqu’il contient des rendez-vous ou demandes ; il n’annonce plus un HQ calme en déduisant zéro document d’une absence de lecture.
- La carte affiche « Indisponible » sans compteur, sans liste résiduelle ni lien de contenu si non lu. Le zéro confirmé est limité à « cette source locale ». Une lecture positive reste étiquetée fixture locale de démonstration, jamais bibliothèque de production.
- Aucun lecteur Supabase, stockage, compte, migration, permission ou fournisseur ajouté. Les autres domaines du CEO Brief ne sont pas refondus.

## Validation

Tests ciblés du lecteur, du service et de la vraie route API avec dépendances synthétiques, et rendu React SSR du vrai panneau. Cas désactivé/absent/erreur/invalide/vide/peuplé, absence d’invocation du lecteur quand désactivé, sérialisation null, refus propriétaire conservé et masquage de données résiduelles. Le banc API substitue l’authentification : aucune preuve de session réelle. Les tests SSR ne prouvent pas un parcours navigateur authentifié ou un contrôle visuel responsive.

Résultat Node 22.23.4 : suite complète 4 586 tests, 4 578 réussis, 8 ignorés, 0 échec ; tripwires 3/3 ; campagne ciblée lecteur/service/API/SSR 21/21, incluse dans la suite complète. Contre-revue indépendante : 26/26 avec garde documentaire, recouvrant les mêmes tests. Types, lint, build, smoke Joris, map et layering passent.

Contrôle de packaging conservé : `node scripts/check-document-index-bundle.mjs` après build. Preuves et chiffres finaux : `/workspace/oria-ceo-document-evidence/DELIVERY.json` ; contre-revue `REVIEW.md`. Les tests ciblés sont inclus dans la suite complète et ne s’y additionnent pas.

Le scénario de régression appliqué au lecteur de la base échoue : il renvoie encore zéro pour source désactivée/absente/invalide. L’assemblage corrigé conserve les sources indisponibles comme inconnues.

## Limites et retour arrière

Ce lot corrige l’honnêteté de l’observation, pas le raccordement aux documents réels. Le lien historique « Ouvrir le coffre » reste inchangé : `/dashboard/documents` affiche actuellement « Module retiré temporairement » (page.tsx:27). C’est une limite UX directement liée et vérifiée : ce lien ne prouve pas l’existence d’un coffre ouvrable. Un prochain correctif borné pourra adapter son libellé/état à cette destination sans reconstruire un système documentaire. La qualification DB/Auth et l’audit de dépendances Inngest/Zod restent distincts. Aucun parcours PostgreSQL/v3 refusé réessayé, aucun push ou déploiement.

Retour arrière par réversion de ce seul commit sur une nouvelle branche ; aucune donnée distante à restaurer. Un consommateur externe éventuel doit accepter `totalCount: null` avant publication de ce contrat.
