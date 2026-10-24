# Livraison locale — noms, employés et qualification

Édition du 24 octobre 2026. Base Git : `2249ac453f720cbe4082caddd9a50c84e2625e3b` (PR405). Branche : `builder/employee-idempotency-local`. Le commit contenant ce manifeste fixe l’assemblage ; son SHA et les résultats finaux sont consignés séparément dans `/workspace/oria-final-delivery-evidence/` pour éviter un SHA autoréférentiel. Aucun push, fusion ou déploiement n’est inclus.

## Périmètre

- Surcharges des noms des agents historiques, IDs inchangés, UI et stockage dédié.
- Employés proposés par business, profil distinct des permissions d’exécution, édition et archivage.
- Création idempotente avec clé UUID et hash initial immuables ; lecture de reprise filtrée propriétaire/workspace/business. Brouillon de reprise dans le sessionStorage de l’onglet, jamais annoncé comme stockage durable d’employé.
- Garde de build staging opt-in et banc UI synthétique explicitement identifié.
- Les flags `AGENT_DISPLAY_NAMES_LIVE` et `EMPLOYEE_DIRECTORY_LIVE` restent `false`. Les permissions/runtime/fournisseurs ne sont pas activés.

## SQL canonique de cette livraison

**Le seul delta complet proposé pour le schéma staging observé est `db/migrations/drafts/names_employees_staging_delta.sql`.** Il contient les deux tables, contraintes, indexes, grants, policies et trigger, avec l’idempotence intégrée. Une transaction, délais bornés et préconditions refusant les objets déjà présents ; jamais de replay de l’historique entier.

Le fichier historique externe `/workspace/oria-staging-qualification/delta-review-only.sql` est obsolète pour cette livraison et ne doit pas être utilisé. Les deux brouillons individuels sont les fragments sources ; ne pas les appliquer après le delta complet. `employee_profiles_idempotency_upgrade.sql` est seulement une alternative si l’ancien schéma employee_profiles a entre-temps été appliqué : ne pas l’enchaîner après le delta complet. Toute dérive du schéma impose comparaison avant écriture, pas ajout d’IF NOT EXISTS pour la masquer.

Le delta complet ajoute l’index `(ventures.id, ventures.workspace_id)` sans supprimer de données ni rejouer les migrations existantes. Les noms sont accessibles par session et RLS propriétaire de ligne. Les employés utilisent le transport serveur existant ; droits clients refusés, UPDATE limité aux champs de présentation et révision, trigger SECURITY INVOKER protégeant identités, clé et hash. La fondation reste single-owner : ni ces policies ni les tests synthétiques ne démontrent une gestion SaaS multi-tenant.

## Prérequis staging connus, non revalidés à cette clôture

- Cible autorisée en lecture : **Oria.hq-staging**, `teatqbtzgzcygpefnfbh`, connexion Supabase mboyer. Dernier état communiqué/vérifié : ACTIVE_HEALTHY, PostgreSQL17.6.1.127, 24 tables public, historique de migrations vide. Historique vide ne signifie pas schéma vide.
- Les deux nouvelles tables étaient absentes ; ventures possède id/workspace_id text nonnull et RLS. Les grants existants larges de ventures n’ont pas été corrigés par ce lot.
- Lecture agrégée Auth : zéro utilisateur à la vérification précédente. Deux utilisateurs de test restent à préparer avec accord explicite, sans copie d’identités/secrets de production.
- Métadonnées de sauvegarde/PITR/restauration non établies : Healthy n’est pas une preuve de sauvegarde.
- Équipe Vercel : `team_Quy65oSq5sUaCr5MnJXF4IyZ`, slug `mboyer1269-pixels-projects`. Projet de qualification séparé non créé. Les previews existantes ne sont pas attestées isolées de la DB production ; ne pas les réutiliser.
- Forfait, crédits, consommation et plafond configuré non accessibles aux lectures réalisées. L’API charges a retourné costs_not_found, pas zéro coût. Aucun budget ou nouveau projet n’est autorisé par ce commit local.

## Gates et limites

1. **Code local** : suite applicable, types/lint/build/smoke/architecture et composants réels avec actions synthétiques ; résultats exacts attachés au SHA dans les preuves externes. Les tests ciblés inclus dans la suite complète ne sont jamais additionnés deux fois. Le runner sépare les tests `*-gap.test.mjs` ; leur résultat est rapporté à part.
2. **SQL local réel** : non passé. Le setup PostgreSQL précédemment refusé n’est pas retenté. Le delta est relu statiquement, pas exécuté : index, trigger, MVCC/concurrence et RLS ne sont pas qualifiés.
3. **Auth/persistance staging et preview** : non passés. Aucun compte créé, secret configuré, migration appliquée ou preview déployée. Les lectures de métadonnées antérieures ne remplacent pas les scénarios authentifiés.
4. **Dépendances** : le résiduel Inngest/Zod connu n’est pas corrigé par ce lot, aucune exception activée. Aucun vert global de livraison/production annoncé.

La garantie idempotente porte sur la même clé. Autre onglet/navigateur, suppression du stockage ou nouvelle intention explicite nécessitent rapprochement. Les brouillons expirés/incohérents bloquent plutôt que d’effacer silencieusement la clé. Un retour serveur ne prouve pas qu’un employé peut exécuter une mission.

La garde `node scripts/qualification-preview.mjs --check|--build` est explicite : `npm run build` direct ne l’applique pas. Elle ne vérifie pas l’appartenance d’une clé et n’est pas un verrou réseau/hébergeur. `NEXT_PUBLIC_*` est figé au build ; ne jamais promouvoir l’artefact staging en production. Une autre cible exige un nouveau build et sa propre validation.

## Retour arrière préféré

Avant toute activation, les flags restent fermés. Après une application future autorisée, fermer les flags et suspendre le parcours dédié ; conserver tables, lignes, IDs, clés et hashes. Ne pas supprimer les colonnes d’idempotence, tronquer les tables ni appliquer les scripts de suppression comme retour arrière par défaut. Si un commit applicatif doit être annulé, utiliser une réversion explicite compatible avec le schéma conservé, pas un reset/force push. Les anciens producteurs sans creationKey sont incompatibles avec le nouveau trigger : garder le parcours fermé lors d’un retour de code.

## Commandes de preuve

Node22.23.4 : `npm test`, `npm run test:gaps` (lecture source, résultat séparé), `node --test scripts/qualification-preview.test.mjs`, `npm run map:check`, `npm run check:layering`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run smoke:joris`, `node scripts/qualification-ui/run.mjs`. Aucun parcours intégré v3 refusé, setup DB, fournisseur ou compte réel n’est exécuté.
