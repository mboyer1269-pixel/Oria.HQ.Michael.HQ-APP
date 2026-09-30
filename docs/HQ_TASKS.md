# HQ constructeur — tâches et critères de sortie

Mise à jour : 30 septembre 2026. Cette liste distingue le code livré sur la
branche de travail, les essais isolés et le fonctionnement réel en service.
Une case cochée ne signifie pas que toute la chaîne est déployée.

## But

Un atelier de développement basé sur OpenHands, accessible depuis ORIA HQ,
qui produit des changements vérifiés et essayables ; utiliser ensuite cet
atelier pour finaliser ORIA. Voir le [plan](PLAN-HQ-CONSTRUCTEUR.md).

## Réalisé dans le code / qualification

- [x] Dossier de mission, préparation et confirmation explicite.
- [x] Contrats et stockage du lancement, des permissions et des états.
- [x] Capture de contexte Memex liée au projet et au dossier confirmé.
- [x] Lecture Memex HTTP et interfaces de proposition / revue gouvernée.
- [x] Exécution isolée et réseau contrôlé dans le dépôt compagnon.
- [x] Parcours connecté avec adaptateur simulé, stockage durable et Memex isolé.
- [x] Diagnostic de reprise en lecture seule et affichage des limites de preuve.
- [x] Budget temporel partagé ; 124 tests du runner passent sous Linux.

## P0 — première mission réelle (critère de réussite immédiat)

- [ ] Obtenir le consentement OAuth de l'instance Claude dédiée, puis confirmer sa connexion.
- [ ] Qualifier le stockage et le renouvellement de l'accès dans le contexte réel d'exécution.
- [ ] Mettre en place la séparation des identifiants entre compte, HQ et outils de mission.
- [ ] Approuver puis publier le cadre de projet Memex par le parcours gouverné.
- [ ] Raccorder HQ en lecture seule au bon projet, avec renouvellement du handle.
- [ ] Activer une configuration opérateur cohérente et les demandes de permission dans HQ.
- [ ] Lancer une modification utile depuis HQ sur une copie isolée au commit connu.
- [ ] Vérifier les changements exacts avec tests et revue indépendante.
- [ ] Fournir un aperçu essayable et une décision de livraison explicite.

Sortie : l'utilisateur peut demander, suivre et essayer un changement réellement
produit par un agent. Une simulation ou une session ouverte ne suffit pas.

## P1 — robustesse et équipe

- [ ] Qualifier arrêt, interruption, reconnexion et reprise avec un vrai exécutant.
- [ ] Vérifier les effets déjà réalisés avant toute nouvelle tentative.
- [ ] Vérifier le parcours complet avec session propriétaire et refus interprojets / RLS.
- [ ] Qualifier Antigravity : accès autorisé, contexte partagé, tâche et résultat.
- [ ] Ajouter un réviseur distinct et mesurer l'intérêt du travail en parallèle.
- [ ] Livrer une première amélioration d'ORIA avec retour arrière vérifiable.

## P2 — efficacité et interface pédagogique

- [ ] Mesurer temps total, usages disponibles, reprises et interventions par mission réussie.
- [ ] Comparer des tâches équivalentes avant de revendiquer une économie.
- [ ] Réutiliser les recettes Memex avec provenance et limites explicites.
- [ ] Rendre visibles l'avancement, les blocages, les preuves et le résultat essayable.
- [ ] Ajouter les explications à la demande et valider les parcours mobile / ordinateur.
- [ ] N'adopter un nouvel outil qu'après un gain démontré sur ces missions.

## Règles de travail

Un résultat utile par mandat ; contexte ciblé ; scripts pour le répétitif ;
réutilisation avant nouvelle couche ; expériences bornées ; revue indépendante ;
aucun succès inventé. Aucun test supplémentaire sans question à trancher.
La publication GitHub n'autorise pas un nouveau compte, ne déploie pas le VPS
et ne prouve pas l'exécution autonome.
