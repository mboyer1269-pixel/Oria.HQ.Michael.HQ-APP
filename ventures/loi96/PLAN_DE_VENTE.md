# Plan de vente — Conformité Loi 96 opérée par agents

> **Note de restauration (2026-06-11) :** fichier reconstruit de mémoire de session après
> disparition des fichiers non commités. Contenu fidèle à la version lue le 2026-06-11.
> Désormais versionné — plus jamais de données de venture hors git.

Objectif : premier forfait signé avant le **9 juillet 2026**. Levier #1 confirmé par simulation : le taux de réponse à l'audit-cadeau. Tout le plan optimise cette variable.

## 1. L'offre (3 étages)

| Étage | Produit | Prix | Rôle |
|---|---|---|---|
| 0 | **Audit de conformité Loi 96** (rapport personnalisé 4-6 pages) | Gratuit | Porte d'entrée — c'est le mécanisme de vente |
| 1 | **Forfait Mise en conformité web** : traduction/adaptation FR du site, formulaires, courriels transactionnels, métadonnées | **2 200 $ fixe** (tester 2 900 $ dès le client 3) — 50 % à la signature | Le cash |
| 2 | **Suivi conformité** : veille mensuelle du site, alertes nouveaux contenus non conformes, rapport OQLF-ready | 350 $/mois | Le MRR (à pousser seulement à la livraison de l'étage 1) |
| 3 (mois 3+) | **Visibilité IA en français (GEO-FR)** : être cité par ChatGPT/Perplexity en FR | 750-2 000 $/mois | L'escalier de croissance — même client, même actif |

**Positionnement : on ne vend PAS de la traduction. On vend l'élimination d'un risque légal chiffré.** La traduction est le moyen. Le mot « amende » vaut plus que le mot « qualité ».

**Garde-fous :** aucun avis juridique (disclaimer dans chaque audit), aucun document légal (réservé aux traducteurs agréés OTTIAQ) — contenu web/marketing seulement.

## 2. Cible (ICP)

**Priorité 1 — la fenêtre chaude :** PME québécoises de 25-49 employés, nouvellement assujetties à l'inscription OQLF (échéance : juin 2026). 85 % ne sont pas inscrites. Elles reçoivent des lettres de l'OQLF, pas des solutions.

**Priorité 2 :** e-commerces hors Québec (Canada anglais, US) qui vendent au Québec avec un site EN-only — le cas Radio-Canada (compagnie qui cesse de livrer au QC) prouve qu'ils paniquent.

**Priorité 3 :** franchisés et commerces avec affichage public (règle du « nettement prédominant » en vigueur depuis juin 2025).

**Où les trouver (gratuit, agentisable) :** répertoires des chambres de commerce régionales, Registraire des entreprises, annuaires sectoriels, recherche de sites .ca avec pages FR absentes ou machine-translated. L'agent-prospecteur construit la liste (L2), Michael valide.

## 3. La séquence (le système de vente)

```
J1-J2   Setup : templates courriel, grille d'audit, page « qui sommes-nous » simple
J3      Premiers 5 audits générés (agent) → QA Michael → ENVOYÉS
Sem. 1+ Rythme : 15 audits/sem (3/jour ouvrable, ~1,5 h/jour de QA+envoi)

Courriel 1 (J0)   : audit PDF joint. Objet : « 7 non-conformités Loi 96 sur [site].com »
Relance 1 (J+4)   : « Avez-vous vu les points 2 et 5? Ce sont les plus coûteux. »
Relance 2 (J+9)   : checklist OQLF gratuite + « l'échéance d'inscription est passée — voici quoi faire »
Réponse → appel 20 min (calendly) → proposition à prix fixe LE JOUR MÊME → dépôt 50 %
```

**Règles d'or issues de la sensibilité :** 15 audits PROFONDS battent 40 audits génériques. Chaque audit nomme des pages précises du site du prospect, capture d'écran à l'appui. Vitesse de réponse < 2 h sur toute réponse entrante.

## 4. Script d'appel (20 min)

1. « Qu'est-ce qui vous a fait répondre? » (laisser parler — la peur dit son prix)
2. Parcourir 3 non-conformités majeures de LEUR site, à l'écran
3. « Deux options : vous le faites à l'interne (voici quoi faire, ~40-60 h), ou on le fait en 10 jours ouvrables à prix fixe, garanti conforme au contenu web. »
4. Prix. Silence. Dépôt 50 % par virement/Stripe. Pas de proposition PDF de 10 pages — un courriel de confirmation d'une page.

## 5. Rôles (boucle Oria, L1-L2)

| Tâche | Qui | Niveau |
|---|---|---|
| Construire la liste de cibles | Agent-prospecteur (Orion) | L2 (Michael valide la liste) |
| Générer l'audit | Agent-auditeur (voir PROMPT_PACK_AUDITEUR.md — à reconstruire) | L2 |
| Envoyer courriels + relances | Michael via Send Desk (drafts Hermès) | L1 |
| Appel + closing | Michael (Peithô en support script) | L0 |
| Mise en conformité (traduction/adaptation) | Agent-traducteur | L2 (QA Michael ~4-6 h/projet) |
| Journal (audits envoyés, réponses, diffs, paiements) | Action Ledger Oria | — |
| Golden examples (meilleurs audits + corrections livrées) | `ventures/loi96/golden/` | — |
