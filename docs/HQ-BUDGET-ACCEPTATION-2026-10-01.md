# Acceptation technique du lot budget et délais — 1 octobre 2026

Code candidat `286a211f6ab4de042d61604df1a33bb9d969b289`, arbre `f7151f6ccb27e4a5bb461663cb1f1e911efcf8d9`, branche `codex/hq-delivery-integration`. Assemblage des patches Cursor de la PR privée Orchestrator 9; l'égalité des arbres a été contrôlée à chaque application. Cette acceptation porte sur le composant désactivé et ses contrats, pas sur une activation du budget dans le chat ou une livraison complète du HQ.

## Corrections retenues

- Réservations durables en cents USD liées au workspace, au sujet, au caller et au modèle. Devis serveur versionné, limité dans le temps et couvrant entrée/système/sortie; refus si la borne manque.
- Gagnant de concurrence calculé, deux ordres couverts, lignes complètes comparées avant/après redémarrage.
- Délai HTTP maintenu jusqu'à la fin du corps. Une émission à résultat inconnu conserve sa réservation.
- Rejet du registre avant émission rendu comme refus, sans appel fournisseur. Après mark incertain, le montant confirmé reste retenu tant que la libération n'est pas confirmée.
- Erreur de consommation après succès : le résultat déjà reçu est conservé, la réservation demande réconciliation, aucun nouvel appel modèle.
- Fallback autorisé mais bloqué après échec du primaire : une seule émission; le coût agrégé conserve `failed_maybe_billed`, pas un faux refus global à zéro réseau.

## Preuves indépendantes

- Node 22.14, Linux : **65 tests ciblés, 0 échec, 0 exclusion**, 7,67 s sur l'arbre final.
- Sonde indépendante de Claude rejouée par Codex : contrôle nominal 1 fetch et résultat conservé; reserve rejeté 0 fetch; mark rejeté 0 fetch; consume rejeté 1 fetch, résultat conservé avec `emitted_unknown`. Le seul ajustement de fixture met `reconciliationRequired=true` pour l'état `emitted_unknown`, conformément au contrat renforcé. Le release de cette sonde répond positivement; les refus et indisponibilités de release sont couverts séparément par les tests ciblés. Les fetch sont synthétiques, aucun fournisseur réel.
- PostgreSQL 16.4 réel : run `1790840244_77530`, exit 0 sur l'arbre `087a126`. Deux ordres de concurrence, devis hors borne refusés, montants/identités/états après redémarrage, nettoyage contrôlé. SQL et banc inchangés dans les deux correctifs finaux; pas de répétition inutile. Ce banc utilise `psql` privilégié et ne prouve pas l'identité HTTP/RLS.
- Délai à 600 ms sur serveur HTTP local : ancien corps bloqué au-delà de 3 s, interruption observée à 601–792 ms après correction. Ce ne sont pas des mesures de latence fournisseur ou de mission réelle.

## Vérifications globales

Sur le code candidat 286a211 : TypeScript réussi (16 s), lint réussi (23 s, 0 erreur et 5 avertissements préexistants), compilation réussie (19 s), smoke local réussi (moins de 1 s). Exit 0 pour chaque commande. Aucun résultat modèle réel.

Journaux locaux dans Orchestrator : `.validation/budget-final/targeted.log`, `independent-probe.log`, `typecheck.log`, `lint.log`, `build.log`, `smoke-joris.log`. La recette PostgreSQL est `.validation/budget-corrected-real-db.log`. Les temps sont ceux des contrôles locaux, pas un gain mesuré en production.

## Publication et limites

Publication limitée à la branche de travail; ni merge principal ni déploiement. `HQ_CALL_RESERVATION` reste éteint. Aucun tarif réel, plafond utilisateur, secret ou compte ajouté. Il faut encore un devis serveur fiable et l'identité des appelants avant activation; une réservation borne le devis, elle ne garantit pas la facture réelle.

Le parcours authentifié Hermes → HQ → OpenHands, un vrai modèle, la reprise réelle, l'aperçu et la validation visuelle de la maquette demeurent les critères de livraison du HQ. AgentMemory reste une mémoire locale de développement.
