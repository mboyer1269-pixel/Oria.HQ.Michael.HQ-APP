# Équipe IA par business — préparation locale, non activée

Base : PR405, `2249ac453f720cbe4082caddd9a50c84e2625e3b`. Branche locale `builder/business-employees-local`. Aucun commit, push, service configuré ou migration appliquée dans ce lot.

## Parcours et contrat

Business enregistré → Mon équipe → Ajouter un employé IA. Nom, spécialité, mandat, rôle et contexte d’affectation sont des descriptions souhaitées, pas des autorisations. Un profil commence `draft` (proposé, non opérationnel) ; il peut être édité ou archivé. L’archivage conserve son ID et son affectation. Aucun effacement ni réactivation automatique. Une édition ne réécrit aucun historique de mission ; ce lot ne crée pas un historique de toutes les versions du texte.

L’ID `emp_UUIDv4` est produit côté serveur. Une ligne `employee_profiles` contient profil et affectation obligatoire à un seul `ventures.id`. Le nom n’est jamais une clé. Ni les 14 profils historiques, ni leurs aliases, rôles, licences, ni le registre d’exécution ne sont modifiés. Le vrai guard d’autonomie refuse le nouvel ID sans licence. Le lot de surcharge de noms historiques reste séparé et intact ; même principe identité immuable / nom éditable, aucun stockage partagé improvisé.

## Choix du stockage

`ventures.assigned_agents` est actuellement un tableau JSON sauvegardé avec la carte entière. Le réutiliser pour les nouveaux profils ferait dépendre les ajouts de lectures et réécritures globales susceptibles de perdre une modification concurrente. Il reste intact. Chaque nouvel employé est une insertion indépendante. Profil et affectation dans une même ligne : aucun second insert à réussir, donc aucun profil orphelin entre deux écritures. La FK composite lie business et workspace ; l’affectation est immuable. Une édition/archivage compare la révision courante et exige l’état draft. Deux éditions de la même révision ne doivent pas toutes deux réussir.

Les actions serveur authentifient via `requireOwnerAccess`, dérivent le workspace via `getDefaultWorkspace`, vérifient le business par `getVentureById` et exigent `getVenturePersistenceMode() === "supabase"`. Le mode local du repository Ventures n’est jamais une preuve de persistance d’employés. Toute panne de stockage reste explicite. Aucun fallback RAM/localStorage dans le code produit.

L’adaptateur réutilise le client serveur existant de Ventures. La table Ventures bloque déjà l’accès direct authenticated ; changer ces droits aurait élargi ce lot. La nouvelle table est également inaccessible aux clients anon/authenticated. Seul le chemin serveur propriétaire peut demander les opérations, filtrées owner/workspace/venture. Le rôle serveur privilégié exige ces filtres : RLS ne remplace pas la barrière applicative. Aucun secret ou nouveau rôle configuré. La migration est uniquement un brouillon sous `db/migrations/drafts`.

**Limite d’autorité :** le système existant est mono-propriétaire. `ventures` n’a pas de colonne propriétaire et le registre de workspace n’est pas une table d’appartenance multi-tenant. Ce lot n’établit donc pas une isolation SaaS générale. Toute évolution multi-propriétaire devra qualifier ces sources d’autorité avant ouverture.

## Fermeture et honnêteté UI

`EMPLOYEE_DIRECTORY_LIVE = false`, sans variable d’environnement pour contourner ce verrou. Tant que fermé, aucune construction de l’adaptateur d’employés : l’écran annonce indisponible et ne prétend pas que l’équipe est vide. Les formulaires ne sont disponibles que sur une lecture ready. Réponse saved signifie uniquement profil enregistré, jamais mission exécutée. Une erreur conserve la saisie, sans renvoi automatique. Une réponse d’écriture perdue reste incertaine : recharger avant toute nouvelle création ; aucune garantie exactly-once n’est revendiquée.

Les champs sont strictement limités ; tout champ supplémentaire (owner/workspace, outil, licence, permission, runtime, modèle, référence de connaissances) est refusé. Il n’existe pas de résolution implicite de références inter-business. Outils souhaités et connaissances pourront faire l’objet d’un contrat de demandes séparé ; aucun droit ne se déduit du texte du mandat.

## Navigateur et terminal futurs

Aucun bouton factice ni session provisionnée. Le futur raccordement devra lier explicitement `employeeId + ownerId + workspaceId + ventureId + taskId + revision`, dans un exécuteur isolé par business/tâche, avec autorisation canonique, capacité qualifiée, budget, secrets séparés, expiration/révocation et reçus. Le répertoire restera distinct de l’identité runtime et de son registre de licences. Aucun branchement de cette sorte n’est réalisé ici.

## Preuves et conditions avant activation

- Tests services/actions/adaptateur avec transport synthétique ; UI réelle montée avec réponses synthétiques. Ce ne sont pas des sessions Supabase authentifiées.
- SQL relu statiquement : PK, FK, état/révision, immuabilité et refus de suppression. Aucun PostgreSQL installé ou démarré ; aucune contrainte exécutée.
- À qualifier sur un environnement DB explicitement autorisé : migrations et rollback de schéma, permissions réelles anon/authenticated/serveur, FK, trois créations relues après nouvelle session, concurrence PostgreSQL, éditions concurrentes, erreurs transactionnelles et archives. Le rollback de schéma détruit les profils et nécessite sauvegarde/validation avant toute utilisation réelle.
- Valider le parcours authentifié complet et la correspondance propriétaire/workspace/business. Aucun projet Supabase visible selon le relevé parent ; pas d’autorisation de créer un projet.
- Le drapeau ne doit être ouvert qu’après ces preuves. L’audit Inngest/Zod résiduel de PR402 reste indépendant et bloquant ; aucune exception ajoutée.

## Sources et méthode

Guides officiels consultés : [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [insert JavaScript](https://supabase.com/docs/reference/javascript/insert). Conventions du dépôt AGENTS.md, skills Supabase, Orya Builder Green Zone, Security Review et UI Verification appliquées dans le périmètre local explicitement autorisé. Le changelog Supabase avait répondu 403 lors du lot précédent : aucune nouvelle tentative ni contournement. Les recommandations du skill demandant une requête DB ne sont pas exécutées, car le mandat interdit le provisionnement et ne donne pas de DB autorisée ; cette limite est conservée.
