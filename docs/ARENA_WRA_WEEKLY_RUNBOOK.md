# Arena WRA Weekly Runbook

## 1. Objectif

Weekly ROI Allocation (WRA) répond chaque lundi à une seule question :

> Cette semaine, où Michael met son temps et son budget agents pour le meilleur ROI ajusté au risque ?

Le runbook sert à transformer les candidats Arena en décisions d'allocation concrètes. Il ne remplace pas le jugement de Michael.

## 2. Cadence

- Lundi AM.
- 15 minutes maximum.
- Michael décide.
- Joris prépare seulement.

## 3. Inputs requis

Pour chaque candidat :

| Champ | Description |
| --- | --- |
| `candidateId` | Identifiant stable du candidat Arena. |
| `title` | Nom court de la mission, idée ou action. |
| `riskLevel` | Niveau de risque connu. |
| `autonomyLevel` | Niveau d'autonomie requis. |
| `estimatedCostCents` | Coût estimé, en cents. |
| `assumedRevenueInfluencedCents` | Revenu influencé estimé, en cents. |
| `evidence note` | Note courte expliquant la preuve. |
| `evidence source` | Source explicite de la preuve. |

## 4. Règle evidence

- Sans evidence : `not-evaluable`.
- Evidence faible : `DEFER`.
- ROI négatif : `KILL`.
- ROI positif secondaire : `GO`.
- Top ROI avec risque maîtrisé : `FOCUS`.

## 5. Buckets

### FOCUS

- 1 seul candidat maximum.
- Reçoit le temps Michael et le budget agents.

### GO

- Délégation agents.
- Pas de temps Michael direct.

### DEFER

- Attendre plus de preuve.

### KILL

- Arrêter ou libérer le budget.

## 6. Budget rule

- Plafond agents : 1500 $ / mois.
- Aucune réallocation automatique.
- Michael approuve manuellement.

## 7. WRA #1 Template

| Candidate | Evidence | Revenue est. | Cost est. | Risk | Autonomy | Bucket | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |

## 8. Success gate

Si la WRA change au moins une vraie allocation de temps ou budget sur 3 lundis, Arena est validée.

Sinon, arrêter d'investir dans Arena.

## 9. Non-goals

- Pas un dashboard.
- Pas une décision automatique.
- Pas un live executor.
- Pas un rapport décoratif.
