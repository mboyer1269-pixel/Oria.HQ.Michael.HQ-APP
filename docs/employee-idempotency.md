# Création idempotente des employés — qualification locale

La commande `create` exige `creationKey`, un UUID v4 minuscule. Ce n’est ni l’ID de l’employé ni une autorisation : le serveur dérive toujours propriétaire/workspace/business via les gardes existantes, puis génère `emp_<UUID v4>`. Modifier un nom ne modifie aucune identité ni permission.

Le même INSERT atomique stocke profil, affectation, clé d’intention et SHA256 d’un tableau JSON ordonné des cinq champs normalisés : nom, spécialité, instructions, rôle d’affectation, contexte. Un index unique global sur les clés non nulles arbitre deux requêtes concurrentes. Sur erreur PostgreSQL `23505` seulement, le repository relit par clé **et propriétaire/workspace/business**. Même empreinte initiale : retourne le profil courant, éventuellement renommé ou archivé, sans écrasement ni réactivation. Autre empreinte ou portée : conflit générique, sans divulgation de la ligne étrangère. Les autres erreurs restent indisponibles, sans réessai automatique.

Le hash initial reste immuable lors des éditions/archives. Il ne représente donc pas le contenu actuel. Une nouvelle intention possède une nouvelle clé et peut légitimement créer un autre employé avec le même nom.

## Brouillons SQL, jamais appliqués ici

- `db/migrations/0035_employee_profiles.sql` : création révisée complète et idempotente (IF NOT EXISTS / CREATE OR REPLACE), non appliquée.
- L’ancien brouillon `employee_profiles_idempotency_upgrade.sql` est retiré : aucune table antérieure n’a été appliquée, la création 0035 porte déjà ces colonnes.
- Ne pas appliquer les deux définitions de colonnes successivement. Les fichiers n’emploient pas `IF NOT EXISTS` pour cacher un schéma divergent.
- Le fichier historique `/workspace/oria-staging-qualification/delta-review-only.sql` reste intact et **n’est plus suffisant seul** : avant application future autorisée, produire un delta consolidé révisé à partir du schéma cible vérifié, ou lui joindre explicitement l’upgrade dans le plan révisé. Rien ne doit être appliqué automatiquement.

L’upgrade peut verrouiller la table pendant l’ajout de contrainte/index ; `lock_timeout=5s` et `statement_timeout=30s` bornent l’attente. Une erreur transactionnelle laisse le schéma précédent. Après validation/commit SQL futur, le retour arrière recommandé est de fermer le flag et conserver les colonnes : les supprimer perdrait les clés de reprise. Ne pas supprimer les lignes ou recréer la table pour revenir en arrière. L’ancien producteur sans clé devient incompatible avec le trigger révisé : déployer ensemble derrière flag fermé.

## Preuves et limites

Les tests locaux exécutent le vrai parseur/service et le vrai adaptateur avec transport PostgREST synthétique. Ils couvrent deux requêtes identiques concurrentes, perte d’acquittement puis resoumission, chaque champ initial divergent, chaque axe de portée divergent, nouvelle intention, relecture, reprise après édition/archivage, clés invalides et erreur DB non rejouée. La contrainte d’unicité est **simulée** : ni concurrence MVCC, ni trigger SQL, ni RLS, ni Auth réelle n’est qualifié par ces résultats. Le schéma SQL est contrôlé statiquement uniquement ; aucun PostgreSQL n’a été installé ou exécuté, conformément au refus précédent.

La garantie de non-duplication suppose conservation de la même clé d’intention. Une suppression manuelle de l’état de reprise du navigateur, un autre navigateur ou une nouvelle intention explicite ne permettent pas de reconnaître automatiquement la même intention humaine. Le stockage navigateur du brouillon n’est jamais annoncé comme preuve de persistance du profil. Les flags restent fermés jusqu’à qualification DB/Auth réelle.
