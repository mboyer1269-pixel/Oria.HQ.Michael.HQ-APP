# Candidat d'intégration HQ — 1 octobre 2026

## Périmètre et provenance

Base produit : `e9ff840a38b4532b687bb29f3e2371afeeb3024e`.
Branche isolée : `codex/hq-delivery-integration`. Aucun déploiement ni fusion dans la branche principale.

- Routage Cursor : sept commits transférés jusqu'à `79b0568bd9b8ae9a3d2b2d992330c94add2e7671`, arbre source `558037ddc80cbcd58a001bb59c5244d79c98e8fa`. Refus des modèles non autorisés, tentatives et coût inconnu conservés, aucun repli payant implicite. Aucun budget durable ajouté.
- Admission Antigravity : les trois fichiers runtime/tests de `e02339f`, sans ses rapports historiques ni sa maquette. Harnais PostgreSQL/PostgREST repris à `720d513aff916bf62505e4678730375944b2e0b2`.
- Accès/reprise Claude : lot séparé encore en cours de revue. Non inclus à la rédaction de cette section.

## Décision de consolidation

Classification : extension du module de missions existant. Propriétaire : équipe HQ. Problème : admission idempotente et récupération d'une demande sans démarrer l'exécution. Contrat partagé : service canonique `createDevelopmentService`, identités et autorisation utilisateur restent gérées par HQ. Entretien : aucune dépendance ajoutée; un adaptateur CLI et son banc de qualification.

Le CLI est un **outil hôte privilégié**, pas une API utilisateur ni un outil à exposer directement au modèle. Le commentaire sur un fichier de configuration protégé ne prouve pas son déploiement sécurisé. Le lanceur, la protection de cette configuration et la délégation d'identité doivent encore être qualifiés avant raccordement à Hermes.

AgentMemory/Memex demeure la mémoire locale de développement. Aucun accès à cette mémoire n'est ajouté au runtime du produit.

## Vérifications réalisées avant le lot Claude

- 61 tests ciblés du routage réussis dans cette copie, réseau remplacé par des fonctions de test.
- 18 tests d'admission/service/handlers réussis, stockage simulé.
- TypeScript, lint, compilation et `smoke:joris` réussis. Lint : cinq avertissements hors lot, zéro erreur. Smoke en stockage local, sans écriture Supabase et sans appel fournisseur.
- Syntaxe des deux fichiers du harnais réel vérifiée. **Aucune qualification PostgreSQL exécutée** : moteur Docker indisponible.

Ces résultats ne qualifient ni un compte fournisseur, ni Hermes installé, ni une mission OpenHands réelle. Ils ne s'appliquent pas automatiquement à un candidat modifié ensuite.

## Suite et conditions de sortie

1. Revoir le commit Claude, rejouer les tests d'accès/reprise et valider l'assemblage final.
2. Exécuter le harnais sur un hôte Docker autorisé : `sh proofs/run-intake-real-db.sh "$PWD"`, avec Node 22. Il crée des ressources jetables propres au run et des ports loopback; il ne doit jamais viser une base de production.
3. Qualifier identité, compte, budget et outils de Hermes, puis une mission réelle jusqu'au résultat vérifié.
4. Faire valider la maquette par Michael avant de l'intégrer. Elle reste dans sa branche Antigravity séparée.

La disponibilité immédiate du HQ complet n'est pas démontrée.
