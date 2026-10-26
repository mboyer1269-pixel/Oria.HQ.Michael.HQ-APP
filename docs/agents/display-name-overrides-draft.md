# Noms d’affichage des agents — préparation non activée

Le nom est une donnée de présentation. L’ID de registre, le runtime, les outils, les permissions et les références historiques ne changent pas.

## État de livraison

`AGENT_DISPLAY_NAMES_LIVE = false`. Aucun mécanisme d’environnement ne l’active. La table n’a pas été créée ni interrogée sur un service réel. Aucun stockage mémoire ou navigateur n’est utilisé comme remplacement. L’éditeur et la page signalent l’indisponibilité ; aucune sauvegarde réussie ne peut être annoncée avec le drapeau fermé.

Les SQL de `db/migrations/0036_agent_display_names*.sql` (après `0033_workspaces.sql` et `0034_display_text_rule.sql`) sont **numérotés, idempotents et non appliqués** à une base distante. Les politiques RLS exigent `auth.uid() = user_id` et l’appartenance au workspace (`workspace_members`) en USING et WITH CHECK ; la validation du nom est la règle partagée `src/core/text/display-text-rule.ts` et son miroir SQL `public.oria_display_text_ok`. Le fichier revert détruit les surcharges : il nécessite une décision et une sauvegarde avant tout usage futur. Le fichier verify lit uniquement les catalogues et ne remplace pas un test RLS authentifié.

## Frontière d’accès et données

Les deux server actions utilisent `requireOwnerAccess`. Le propriétaire provient de `access.user.id` et le workspace du resolver existant `getDefaultWorkspace`. Aucun propriétaire/workspace n’est accepté dans la commande cliente. Ce resolver est actuellement mono-workspace : cette préparation n’ajoute pas une gestion multi-tenant.

L’adaptateur utilise `createServerSupabaseClient`, donc la session authentifiée et les politiques RLS, pas le client service-role. Clé composite `(user_id, workspace_id, agent_id)`. Les lectures et mutations filtrent systématiquement cette portée. Le brouillon SQL restreint chaque ligne à `auth.uid() = user_id` ; UPDATE est accordé seulement à `display_name`, jamais aux colonnes d’identité. Les IDs admissibles correspondent au registre actuel. Un ajout d’agent nécessitera une mise à jour explicite de cette contrainte avant activation.

La commande accepte exactement `agentId` et `displayName`. Nom : trim, 1 à 80 caractères Unicode, sans contrôles internes ; `null` demande le reset. IDs inconnus, propriétaire injecté, workspace injecté, runtime et champs supplémentaires sont rejetés. Les noms sont rendus en texte React, jamais en HTML interprété.

La sauvegarde tente UPDATE du seul nom puis INSERT si la ligne est absente. Une première écriture concurrente peut rencontrer une unicité et retourner indisponible : aucun retry automatique ni faux succès. Le retour doit correspondre à la portée et au nom demandés. Le reset supprime seulement la surcharge et relit pour confirmer son absence. Ces garanties d’adaptateur sont testées avec transport synthétique, pas avec une DB authentifiée.

## Résolution des noms

Le registre statique reste intact. La lecture serveur fusionne uniquement les noms et appelle `getDefaultAssistantProfile(workspace, overrides)`. Les cartes et l’assistant du CommandCenter `/hq` utilisent ce résultat. Les helpers de `naming.ts` acceptent le même dictionnaire par requête, avec leurs valeurs par défaut inchangées et sans variable globale mutable. Les aliases d’IDs continuent de résoudre les mêmes identités.

Les autres anciennes surfaces qui appellent encore les helpers sans surcharges gardent leurs noms par défaut. Cette préparation ne réécrit pas les textes des historiques ni les prompts, ne fait pas une refonte de toutes les surfaces, et n’invente pas un rôle ou une permission à partir du nom. L’intégration avec la PR405 devra réconcilier les props du CommandCenter et les changements communs sur `/hq/agents` ; ce lot reste isolé depuis sa base, sans mélange ni publication.

## Vérification et condition d’ouverture

Tests locaux : normalisation, IDs inconnus, champs interdits, isolation propriétaire/workspace, refus de ligne étrangère, reset, erreurs, invariance des IDs/runtime/outils, noms par défaut, aliases, propriétés héritées et frontière owner des actions. Adaptateur Supabase réel testé avec transport synthétique. DDL vérifié statiquement, pas exécuté. L’éditeur réel est monté avec une action synthétique explicitement étiquetée pour tester erreur, sauvegarde, reset et échappement.

L’ouverture exige une qualification ultérieure autorisée : migration provisionnée, accès réel du propriétaire, read-after-write et nouvelle session, reset et échecs, refus d’un autre propriétaire, immutabilité des clés, vérification des grants/RLS via API authentifiée. Aucun de ces résultats n’est présumé ici. Il n’y a ni migration distante ni installation PostgreSQL dans ce lot.

Sources officielles consultées : [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API upsert](https://supabase.com/docs/reference/javascript/upsert). L’upsert a été écarté au profit d’UPDATE du seul nom pour respecter les droits limités par colonne. Le changelog markdown n’a pas pu être lu : format refusé par le lecteur web, puis HTTP403 ; pas de nouvelle tentative.
