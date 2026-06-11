# Simulation Monte-Carlo — Venture Loi 96

> **Note de restauration (2026-06-11) :** reconstruit de mémoire de session (lecture du
> 2026-06-11). Le script `monte_carlo.py` est perdu — les résultats ci-dessous sont les
> chiffres exacts de la dernière exécution. Re-générer le script si une nouvelle
> simulation est nécessaire.

10 000 itérations, 90 jours, événements discrets (les clients sont des humains entiers, pas des fractions).

## Résultats

| Métrique | P10 (pessimiste) | P50 (médiane) | P90 (optimiste) |
|---|---:|---:|---:|
| Revenu 30 jours | 0 $ | 46 $ | 1 742 $ |
| Revenu 90 jours | 0 $ | **5 210 $** | 13 308 $ |
| Coûts 90 jours | 401 $ | 570 $ | 805 $ |
| Profit 90 jours | -381 $ | **4 633 $** | 12 600 $ |
| Clients forfait signés | 0 | 2 | 5 |
| Heures Michael (90 j) | 53 h | 85 h (~6,5 h/sem) | 129 h |
| $/heure Michael | -6 $ | **54 $/h** | 119 $/h |

| Probabilités clés | |
|---|---:|
| P(premier dollar ≤ 30 jours) | **36 %** |
| P(zéro client à 90 jours) | **12,8 %** |
| Coût total / client signé (médiane) | 225 $ |
| Marge brute médiane | **89 %** |

## Lecture honnête

1. **L'impératif 21-30 jours est à risque : 36 % de chances seulement.** Pas parce que la demande manque — à cause des délais incompressibles (envoi → réponse → appel → signature ≈ 2-3 semaines). Mitigation : commencer l'envoi au jour 3, pas au jour 10, et exiger un dépôt de 50 % à la signature.
2. **Le scénario médian est sain :** ~5 200 $ en 90 jours, 89 % de marge, 54 $/h pour ton temps. Le P10 est une perte de 381 $ — ton risque maximal est dérisoire.
3. **Couper les coûts AI/API : mauvais combat.** Corrélation coût API ↔ profit = +0,003 (nulle). Les API coûtent ~225 $/client signé sur ~2 200 $ encaissés.

## Sensibilité — où mettre ton énergie

| Levier | Corrélation avec le profit | Implication |
|---|---:|---|
| **Taux de réponse à l'audit** | **+0,41** | Le levier #1, et de loin. Qualité + personnalisation + ciblage de l'audit-cadeau > tout le reste |
| Closing appel → forfait | +0,27 | Script d'appel et offre claire à prix fixe |
| Volume d'audits/sem | +0,23 | Compte, mais moins que la qualité — 15 audits profonds > 40 audits génériques |
| Prix du forfait | +0,18 | Tester 2 200 $ vs 2 900 $ tôt |
| Attach retainer | +0,03 | Ignorer pour l'instant — c'est du mois 3+ |
| Coût API | +0,00 | Ignorer |
