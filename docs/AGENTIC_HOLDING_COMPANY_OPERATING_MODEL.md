# Agentic Holding Company Operating Model

> **Codename:** SOVRA — Agentic Holding Company OS
> **Surface:** Oria HQ (workspace, cockpit, ledger)
> **Document type:** Doctrine et gouvernance (docs-only, aucun code)
> **Status:** Draft v1 — soumis pour revue Risk Office
> **Last updated:** 2026-05-22
> **Branch:** `claude/agentic-holding-company-operating-model`
> **Owner:** Michael Boyer (President / Capital Allocator)

---

## Table of Contents

1. [Executive Thesis](#1-executive-thesis)
2. [Governance Stack](#2-governance-stack)
3. [Company Charter Model](#3-company-charter-model)
4. [Agent CEO Model](#4-agent-ceo-model)
5. [Sub-Agent Employee Model](#5-sub-agent-employee-model)
6. [Autonomy License](#6-autonomy-license)
7. [First Revenue Venture](#7-first-revenue-venture)
8. [Open-Source Pattern Intake](#8-open-source-pattern-intake)
9. [Hostinger / Agile Hermes Intake](#9-hostinger--agile-hermes-intake)
10. [Operating Flow](#10-operating-flow)
11. [Risk Register](#11-risk-register)
12. [30-Day Execution Plan](#12-30-day-execution-plan)
13. [Final Decision](#13-final-decision)

---

## 1. Executive Thesis

### 1.1 Ce qu'on construit

**SOVRA est un Agentic Holding Company OS.** Oria HQ en est le cockpit propriétaire — la surface de travail, d'approbation et de gouvernance. SOVRA est le modèle d'exploitation que cette surface anime.

L'objectif n'est pas d'avoir des assistants. L'objectif n'est pas d'avoir des "mini-business tests". L'objectif est de **créer, gouverner et faire croître des entreprises B2B réelles, opérées à 80-90 % par agents IA, sous la gouvernance d'un Owner humain, d'un Risk Office indépendant et d'un Operating Partner (Joris)**.

Chaque entreprise dans la holding :

- a une **Company Charter** (statuts constitutifs) qui définit son marché, son offre, son P&L, son budget, ses KPI ;
- est dirigée par un **Agent CEO** doté d'un mandat clair et d'une licence d'autonomie graduée ;
- emploie des **sous-agents** spécialisés (Scout, Builder, Closer, Operator, Auditor, Money) avec des rôles, des contraintes héritées et un ledger obligatoire ;
- opère sous **gates de risque** explicites avant toute action externe ;
- rapporte au **Ledger** (`docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` étendu) chaque décision, output, dépense et résultat ;
- peut être **arrêtée par kill switch** sans démanteler l'OS.

### 1.2 Pourquoi maintenant

En mai 2026, trois signaux convergent :

1. **Maturité des agents en production B2B.** Les frameworks d'orchestration (LangGraph state machine + human-in-the-loop, AutoGen multi-agents, MetaGPT SOP-first) sont stables. Anthropic, OpenAI et Google poussent des outils natifs (computer use, code execution, structured tool calling) qui rendent l'autonomie supervisée viable, pas hypothétique.
2. **Budget IA disponible côté SMB et mid-market.** Les PME nord-américaines ont absorbé que l'IA n'est plus une R&D mais une ligne OPEX. Le frein n'est plus le budget — c'est la confiance et la preuve de ROI.
3. **Fenêtre de productisation.** Les agents génériques (ChatGPT, Gemini) ne résolvent pas un workflow B2B vertical. Une holding qui productise un agent par verticale — pas une suite généraliste — a un avantage de spécialisation, de défensibilité et de pricing.

### 1.3 Ce qu'on NE construit PAS

- Pas une plateforme SaaS multi-tenant générique.
- Pas un marketplace d'agents.
- Pas un "GPT store" custom.
- Pas un produit qui dépend d'un éditeur tiers (n8n, Make, Zapier) pour son moteur d'exécution.
- Pas une fonderie d'idées sans P&L.

### 1.4 Métrique de succès du modèle

Le modèle SOVRA réussit si, dans 12 mois :

- ≥ **2 ventures** ont chacune ≥ **5 000 $ MRR** sous Agent CEO autonome niveau ≥ 5 ;
- ≥ **80 %** des décisions opérationnelles de ces ventures sont prises sans intervention humaine, mais **100 %** sont traçables dans le Ledger ;
- **0 incident** de breach de risk gate ayant causé un dommage externe (client, juridique, financier) ;
- la holding peut **lancer une nouvelle venture en ≤ 14 jours** depuis Company Charter → premier client payant.

---

## 2. Governance Stack

### 2.1 Cinq couches

```
┌───────────────────────────────────────────────────────────────┐
│  L0 — OWNER LAYER                                              │
│  Michael Boyer (President / Capital Allocator)                 │
│  Décide : capital, ventures à lancer, sorties, kill switch.   │
├───────────────────────────────────────────────────────────────┤
│  L1 — RISK OFFICE                                              │
│  Indépendant. Veto sur toute mission risk=high ou autonomy≥5.  │
│  Composition : 1 humain (Michael en mode "risk hat") +         │
│  1 agent Auditor (Hermes Auditor) sans pouvoir d'exécution.   │
├───────────────────────────────────────────────────────────────┤
│  L2 — OPERATING PARTNER                                        │
│  Joris — CEO opératoire de la holding.                         │
│  Reçoit l'intent, planifie, route vers ventures, consulte L1.  │
├───────────────────────────────────────────────────────────────┤
│  L3 — VENTURE LAYER                                            │
│  Agent CEOs (un par Company Charter).                          │
│  Dirige une entreprise complète sous mandat.                   │
├───────────────────────────────────────────────────────────────┤
│  L4 — EXECUTION LAYER                                          │
│  Sub-agents (Hermes Scout, Builder, Closer, Operator, Money). │
│  Skills atomiques, outils, runtime, ledger.                    │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Rôles, mandats et limites

| Rôle | Mandat | Pouvoir | Limite dure |
|------|--------|---------|-------------|
| **Michael (Owner)** | Allocation de capital, kill switch, ratification des Charters | Crée, ferme, vend une venture. Approuve autonomy ≥ 5. | Ne contourne PAS le Ledger. Ne court-circuite PAS le Risk Office sur risk=high. |
| **Risk Office** | Veto indépendant, audit continu | Bloque toute mission risk=high. Force re-Charter si déviation. | N'opère PAS. Ne dirige PAS de venture. |
| **Joris (Operating Partner)** | Routing, planification, orchestration cross-venture | Ouvre missions, assigne Agent CEOs, escalade vers Owner | Ne dépense PAS sans budget Charter. N'exécute PAS de mission externe sans gate L1. |
| **Agent CEO** | Diriger UNE venture selon sa Charter | Recrute sous-agents (skills/outils alloués), alloue budget intra-Charter, propose pivot | Ne modifie PAS sa propre Charter. Ne dépasse PAS son budget cap. N'élève PAS son autonomy seul. |
| **Sub-agent** | Exécuter un domaine spécialisé pour son parent | Utilise skills assignées, écrit au Ledger | Hérite des limites du parent. Aucune capacité tierce sans skill explicite. |

### 2.3 Séparation des pouvoirs

**Règle d'or :** un même acteur ne peut **jamais** être à la fois exécutant et approbateur de la même classe de risque.

- Joris ne peut pas s'auto-approuver une mission risk=high → Risk Office.
- Un Agent CEO ne peut pas s'auto-attribuer un budget supplémentaire → Owner ratifie.
- Hermes Auditor (Risk Office côté agent) n'a aucun outil d'exécution externe — `mode: read-only`, jamais `live`.
- Le Ledger est append-only ; ni Joris ni un Agent CEO ne peut rééditer une entrée historique.

### 2.4 Alignement avec l'existant

Cette stack ne remplace pas le modèle Mission existant (`docs/MISSION_MODEL_PROPOSAL.md`) — elle l'**emballe**. Une Mission reste l'unité de travail. Une Company Charter est une enveloppe contractuelle qui regroupe : un Agent CEO, un set de skills, un budget, une grille d'autonomie, et qui produit des Missions traçables dans le Ledger existant.

---

## 3. Company Charter Model

### 3.1 Schéma de la Charter

Chaque entreprise dans la holding est définie par une Charter TypeScript-typable, ratifiée par l'Owner et auditée par le Risk Office.

```ts
export type CompanyCharter = {
  // Identité
  id: CompanyId;                       // ex: "suivia.revenue-intelligence"
  name: string;                        // "Suivia Revenue Intelligence"
  thesis: string;                      // ≤ 280 chars — pourquoi ça existe
  status: "draft" | "ratified" | "active" | "paused" | "wound-down";

  // Marché
  market: {
    geo: string[];                     // ["QC", "ON"]
    industry: string;                  // "Cliniques esthétiques"
    icp: string;                       // Description précise du client idéal
    pain: string;                      // Problème quantifié
    tam: { value: number; currency: string; source: string };
  };

  // Offre & économique
  offer: {
    name: string;
    description: string;
    deliverable: string;               // Ce que le client reçoit chaque mois
    pricing: { model: "subscription" | "usage" | "one-time"; amount: number; currency: string };
    revenueModel: string;
  };
  pnlAssumptions: {
    cac: number;                       // Customer Acquisition Cost cible
    ltv: number;                       // Lifetime Value cible
    grossMargin: number;               // 0..1
    breakEvenClients: number;
  };

  // Gouvernance
  agentCeoId: AssistantProfileId;      // Référence à un AgentCEOCharter
  subAgentsAllowed: AssistantProfileId[];
  skillsAllowed: SkillId[];            // Whitelist explicite
  skillsForbidden: SkillId[];          // Blacklist explicite (ex: outreach externe)
  budgetCap: {
    monthlyCents: number;              // Budget mensuel max (API + outils + spend)
    burstCents: number;                // Burst autorisé sans re-approbation
  };
  autonomyLevel: AutonomyLevel;        // 0..7 (voir §6)
  riskGates: RiskGate[];               // Conditions bloquantes

  // KPI & reporting
  kpis: KPI[];                         // Avec target, source, cadence
  reportingCadence: "daily" | "weekly" | "biweekly" | "monthly";
  ledgerRequirements: {
    everyExternalAction: true;         // toujours true
    everyClientPromise: true;
    everySpendOverCents: number;       // ex: 500 cents = 5$
  };

  // Kill switch
  killSwitch: {
    conditions: string[];              // Conditions automatiques de pause
    cooldownDays: number;              // Délai avant re-activation possible
    owner: "owner-only" | "owner-or-risk-office";
  };

  // Métadonnées
  ratifiedBy: { ownerSignature: string; riskOfficeSignature: string; ratifiedAt: string };
  version: number;
  history: CharterRevision[];
};
```

### 3.2 Cycle de vie

```
draft → risk-review → ratified → active → (paused | wound-down)
                                    ↓
                                 audit-cycle (quarterly)
                                    ↓
                              re-ratification ou pause
```

- Une Charter **draft** est rédigée par l'Owner avec assistance de Joris.
- Le passage à **ratified** exige signature Owner + signature Risk Office.
- **Active** = Agent CEO peut opérer dans le périmètre.
- Toute modification de Charter → nouvelle version + ratification + entrée Ledger.

### 3.3 Règles d'invariance

- Une Charter ne peut **PAS** être modifiée par l'Agent CEO qu'elle gouverne.
- Une Charter ne peut **PAS** être supprimée — seulement `wound-down` (archivée, append-only).
- Le `budgetCap` ne peut être dépassé qu'avec **ratification Owner explicite** (nouvelle révision).
- Les `skillsForbidden` sont absolues — pas de contournement par sous-agent ou délégation.

### 3.4 Exemple rempli — Suivia Revenue Intelligence

Voir [§7 First Revenue Venture](#7-first-revenue-venture) pour une Charter complète remplie.

---

## 4. Agent CEO Model

### 4.1 Schéma de l'Agent CEO Charter

```ts
export type AgentCEOCharter = {
  id: AssistantProfileId;              // ex: "hermes-scout.suivia"
  baseProfile: "hermes-scout" | "hermes-closer" | "hermes-builder" | "hermes-operator" | "hermes-money";
  companyId: CompanyId;                // Une seule venture par Agent CEO

  // Mandat
  mandate: {
    objective: string;                 // ≤ 500 chars
    revenueTargets: { period: "30d" | "90d" | "1y"; mrrCents: number }[];
    successCriteria: string[];
    pivotConditions: string[];
  };

  // Équipe autorisée
  subAgents: {
    profileId: AssistantProfileId;
    role: string;
    autonomyInherited: AutonomyLevel;  // Plafonné au niveau du parent
  }[];

  // Outils & skills (whitelist)
  skills: SkillId[];                   // Sous-ensemble de companyCharter.skillsAllowed
  tools: ToolId[];                     // Outils techniques (Supabase, Calendar, etc.)

  // Budget alloué
  budget: {
    monthlyCents: number;              // ≤ companyCharter.budgetCap.monthlyCents
    consumed: number;
    burstUsed: number;
  };

  // Autonomy & reporting
  autonomyLevel: AutonomyLevel;        // ≤ companyCharter.autonomyLevel
  reportingTo: "joris";                // Toujours Joris (jamais directement à Owner)
  reportCadence: "daily" | "weekly";

  // Conditions d'élévation d'autonomy
  promotionRequirements: {
    targetLevel: AutonomyLevel;
    requires: {
      consecutiveCleanMissions: number;     // ex: 20
      noRedTeamFlagsForDays: number;        // ex: 30
      mrrThresholdCents?: number;
      ownerApproval: true;
      riskOfficeApproval: true;
    };
  }[];
};
```

### 4.2 Ce qu'un Agent CEO peut faire

- Ouvrir des Missions vers ses sous-agents.
- Allouer son budget intra-Charter (respect du cap).
- Proposer un **pivot** (motion formelle, votée par Owner + Risk Office).
- Demander une **élévation d'autonomy** si les `promotionRequirements` sont remplies.
- Recruter un nouveau sous-agent **depuis la liste `subAgentsAllowed`** de sa Charter (pas en dehors).

### 4.3 Ce qu'un Agent CEO ne peut PAS faire

- Modifier sa propre Charter.
- Modifier sa propre `autonomyLevel`.
- Dépasser son `budgetCap`.
- Utiliser une skill listée dans `skillsForbidden`.
- Communiquer directement avec un autre Agent CEO sans passer par Joris.
- Promettre un livrable au-delà de son `deliverable` Charter.

### 4.4 Cas spécial : un seul Agent CEO par venture

Règle stricte. Pas de co-CEOs agentiques. Si deux Agent CEOs sont nécessaires, c'est que la venture devrait être **scindée en deux Charters**.

---

## 5. Sub-Agent Employee Model

### 5.1 Schéma

```ts
export type SubAgent = {
  id: AssistantProfileId;
  baseProfile: HermesProfile;
  parentAgentId: AssistantProfileId;   // Agent CEO de référence
  companyId: CompanyId;                // Hérité du parent

  role: string;                        // "Market Researcher", "Lead Qualifier"
  responsibilities: string[];

  // Contraintes héritées (jamais plus permissives que le parent)
  inheritedConstraints: {
    skillsAllowed: SkillId[];          // ⊆ parent.skills
    skillsForbidden: SkillId[];        // ⊇ parent skills forbidden
    autonomyLevelMax: AutonomyLevel;   // ≤ parent.autonomyLevel
    budgetMaxPerMissionCents: number;
  };

  // Outputs attendus
  expectedOutputs: {
    type: "report" | "draft" | "data" | "decision";
    schema: string;                    // Référence à un schéma Zod
    cadence?: "per-mission" | "daily" | "weekly";
  }[];

  // Ledger obligatoire
  ledgerObligations: {
    everyMission: true;
    everyExternalRead: true;
    everyToolInvocation: true;
  };
};
```

### 5.2 Profils Hermes (réutilisation du catalogue existant)

| Profil | Domaine | Autonomy max recommandée v1 |
|--------|---------|-----------------------------|
| **Hermes Scout** | Market scan, lead triage, signal detection (read-only) | 4 (internal execution) |
| **Hermes Builder** | Specs, drafts MVP, prompts, prototypes internes | 3 (recommend) — pas de deploy |
| **Hermes Closer** | Scripts d'appel, séquences follow-up, propositions | 2 (draft) en v1 — élévation après Red Team |
| **Hermes Operator** | SOPs, workflow maps, runbooks | 4 (internal execution) |
| **Hermes Money** | Cash snapshot, runway, P&L (read-only) | 2 (draft) — jamais d'exécution financière |
| **Hermes Auditor** | Red Team, risk review | 1 (research) — **JAMAIS d'exécution** |

### 5.3 Règle d'héritage

> Un sous-agent ne peut JAMAIS être plus permissif que son parent. Si un sous-agent a besoin d'une capacité absente du parent, c'est le parent qui doit d'abord acquérir cette capacité (via re-Charter), pas le sous-agent qui contourne.

---

## 6. Autonomy License

### 6.1 Échelle 0–7

Chaque Mission, Agent CEO et Sub-agent porte un niveau. Le niveau effectif d'une action = `min(mission.level, agent.level, parent.level, company.level)`.

| Niv | Nom | Permis | Interdit | Condition de passage au suivant |
|-----|-----|--------|----------|----------------------------------|
| **0** | Locked | Rien | Tout output utilisateur | Ratification initiale Charter |
| **1** | Research | Lecture sources publiques, synthèse, citations | Toute production destinée à un tiers | 5 missions de recherche clean |
| **2** | Draft | Production de brouillons internes (offres, scripts, specs) | Envoi externe, publication | 10 brouillons revus par Owner avec ≥ 80 % d'acceptation |
| **3** | Recommend | Recommandations chiffrées, scoring, priorisation | Décisions engageantes | 10 recommandations dont ≥ 80 % suivies par l'Owner OU explicitement rejetées avec motif |
| **4** | Internal execution | Exécution dans systèmes internes (Supabase, fichiers, base de connaissance, calendrier interne) | Toute action visible d'un tiers (email, SMS, web post, paiement) | 20 exécutions internes sans incident + Red Team pass |
| **5** | Supervised external | Actions externes **avec approbation par mission** (envoi email, post LinkedIn, message client) | Actions externes en batch sans approbation explicite | 30 actions externes approuvées sans incident + ≥ 1 client payant + Risk Office sign-off |
| **6** | Budgeted semi-autonomy | Actions externes par batch dans un budget pré-approuvé (ex: 50 cold emails/sem, max 100$ ads/sem) | Engagement contractuel, dépense > burst, promesse ROI chiffrée | 60 jours à niv 5 sans incident + ≥ 3 clients payants + audit Risk Office trimestriel pass |
| **7** | Venture autonomy | Diriger la venture en quasi-totalité : produit, marketing, acquisition, support, finance opérationnelle (dans budgetCap) | Modification Charter, embauche hors `subAgentsAllowed`, sortie, M&A, kill | ≥ 5 K$ MRR stable 3 mois + 0 incident bloquant + ratification Owner annuelle |

### 6.2 Règles de promotion

- **Aucune auto-promotion.** Un Agent CEO peut *demander* une promotion ; seuls Owner + Risk Office l'accordent.
- **Démotion automatique** : tout incident `risk=high` non détecté par l'agent → démotion d'un niveau, déclenchement audit.
- **Cooldown** : minimum 14 jours entre deux promotions consécutives d'un même Agent CEO.
- **Audit obligatoire** à chaque changement de niveau, consigné au Ledger.

### 6.3 Mapping vers le `MissionAutonomyLevel` existant

Le modèle Mission actuel a déjà un `autonomyLevel`. Cette échelle 0-7 doit être adoptée comme **valeur canonique** ; le typage `MissionAutonomyLevel` sera étendu en Phase 1.

---

## 7. First Revenue Venture

### 7.1 Évaluation comparative

| Venture | Marché | Time-to-revenue | Risque | Cash needed | Score (10) |
|---------|--------|------------------|--------|-------------|------------|
| **Suivia Revenue Intelligence** | Cliniques esthétiques QC/ON | 30-60 jours | Faible | < 500$ | **8.5** |
| **MVP Factory** | Founders solo, agences | 60-90 jours | Moyen (livrable lourd) | 1-3 K$ | 6.5 |
| **Automation Ops** | PME services | 60-90 jours | Moyen (intégrations) | 500-1500$ | 7.0 |
| **Lead Acquisition Desk** | Agents immo, courtiers | 30-45 jours | Élevé (réputation) | 500-1000$ | 7.5 |
| **DADZCO Brand Lab** | Parents jeunes | 90-180 jours | Élevé (POD, stock) | 2-5 K$ | 4.5 |

**Critères de scoring** (chacun /10, moyenne) :
- douleur marché × budget disponible × vitesse ROI × défensibilité × cash needed (inversé) × alignement avec stack existante.

### 7.2 Recommandation : **Suivia Revenue Intelligence**

**Pourquoi maintenant :**
- Tu connais déjà ce marché (background immobilier + Suivia/NOORKI orientés services).
- Cliniques esthétiques QC/ON ont budget marketing, problème lead-quality, faible saturation IA verticale.
- Livrable mensuel = briefing intelligence (PDF/dashboard) — pas de live executor requis en v1, donc compatible avec `autonomy ≤ 4`.
- Premier client peut être signé à **niveau 3 (Recommend)** : tu envoies le brief, le client paie le brief.
- Capital initial < 500$ (API + outils déjà connectés).
- Indépendant des décisions d'infra (VPS, runtime) — peut générer cash AVANT que l'OS soit fini.

### 7.3 Company Charter complète — `suivia.revenue-intelligence`

```yaml
id: suivia.revenue-intelligence
name: Suivia Revenue Intelligence
thesis: >
  Convertir le signal marché des cliniques esthétiques QC/ON en briefings
  d'opportunités hebdomadaires, avec recommandations de campagnes et
  segmentation lead. Vendu en abonnement mensuel.
status: draft

market:
  geo: ["QC", "ON"]
  industry: "Cliniques esthétiques & médico-esthétiques"
  icp: >
    Clinique 1-5 praticiens, 200K-2M$ CA, propriétaire-opérateur,
    sans CMO interne, dépense déjà 1K-5K$/mois marketing.
  pain: >
    Lead-flow inconsistant, dépense Meta Ads non optimisée, CRM
    sous-utilisé, pas de visibilité sur les tendances locales /
    concurrents / saisonnalité.
  tam: { value: 1200, currency: "CAD", source: "Estimation interne — ~1200 cliniques QC/ON éligibles" }

offer:
  name: "Suivia Brief Hebdo"
  description: >
    Briefing intelligence hebdomadaire personnalisé : signaux concurrents,
    tendances locales, recommandations campagnes, segmentation patient
    actionnable, scoring lead par source.
  deliverable: >
    1 PDF de 4-6 pages par semaine + tableau de bord live (Supabase view)
    + 1 appel mensuel de 30min de revue.
  pricing: { model: "subscription", amount: 497, currency: "CAD" }
  revenueModel: "Abonnement mensuel"

pnlAssumptions:
  cac: 150
  ltv: 2982       # 6 mois × 497$
  grossMargin: 0.85
  breakEvenClients: 6   # ~3K$/mois couvre opex + un peu de salaire

agentCeoId: "hermes-scout.suivia"
subAgentsAllowed:
  - "hermes-scout.suivia.researcher"
  - "hermes-builder.suivia.brief-writer"
  - "hermes-operator.suivia.qa"
  - "hermes-money.suivia.tracker"
skillsAllowed:
  - opportunity.scan
  - lead.triage
  - offer.generate          # Drafts internes seulement
  - followup.sequence       # Drafts internes seulement
  - brief.compose
  - signal.collect.public
  - data.synthesize
skillsForbidden:
  - email.send.external
  - sms.send
  - ads.spend
  - calendar.book.external
  - payment.process
  - linkedin.post
  - linkedin.dm

budgetCap:
  monthlyCents: 50000        # 500$/mois (API + outils)
  burstCents: 10000          # 100$ burst sans re-approbation

autonomyLevel: 3   # Recommend — tout output externe passe par Owner approval en v1

riskGates:
  - id: "no-external-without-owner"
    rule: "Aucune action externe sans approbation Owner explicite par Mission"
    severity: "blocking"
  - id: "no-roi-guarantee"
    rule: "Interdit de promettre un ROI chiffré au client (pas de '+30% leads garanti')"
    severity: "blocking"
  - id: "no-pii-storage-non-encrypted"
    rule: "Données client stockées uniquement dans Supabase (encrypted at rest)"
    severity: "blocking"
  - id: "no-competitor-impersonation"
    rule: "Jamais d'imitation de concurrent dans briefings ou outreach"
    severity: "blocking"

kpis:
  - { name: "MRR", target: 100000, unit: "cents", cadence: "weekly", source: "supabase.subscriptions" }
  - { name: "Active clients", target: 5, unit: "count", cadence: "weekly", source: "supabase.subscriptions" }
  - { name: "Brief quality score", target: 0.8, unit: "ratio", cadence: "weekly", source: "owner.review" }
  - { name: "Churn 30d", target: 0.0, unit: "ratio", cadence: "monthly", source: "supabase.subscriptions" }
  - { name: "Conversation→client conversion", target: 0.3, unit: "ratio", cadence: "monthly", source: "ledger" }

reportingCadence: "weekly"

ledgerRequirements:
  everyExternalAction: true
  everyClientPromise: true
  everySpendOverCents: 500   # toute dépense > 5$ tracée

killSwitch:
  conditions:
    - "Plainte client jugée fondée par Risk Office"
    - "Dépassement budgetCap > 20% sur 2 semaines"
    - "Incident risk=high non détecté par Agent CEO"
    - "Churn 30d > 50%"
  cooldownDays: 14
  owner: "owner-only"
```

### 7.4 Agent CEO Charter — `hermes-scout.suivia`

```yaml
id: hermes-scout.suivia
baseProfile: hermes-scout
companyId: suivia.revenue-intelligence

mandate:
  objective: >
    Atteindre 5 clients actifs à 497$/mois (≈2.5K$ MRR) dans 90 jours en
    livrant des briefings hebdomadaires de qualité ≥ 0.8/1.0 et en pilotant
    une équipe de sous-agents (research, brief writing, QA, money tracking).
  revenueTargets:
    - { period: "30d", mrrCents: 100000 }    # 1 client signé
    - { period: "90d", mrrCents: 250000 }    # 5 clients
    - { period: "1y", mrrCents: 1000000 }    # 20 clients
  successCriteria:
    - "Qualité brief ≥ 0.8 sur 80% des semaines"
    - "Churn 30d = 0% pendant 90 jours"
    - "Time-to-brief ≤ 6h de génération"
  pivotConditions:
    - "0 client signé après 45 jours de outreach approuvé"
    - "Qualité brief < 0.6 sur 3 semaines consécutives"

subAgents:
  - { profileId: "hermes-scout.suivia.researcher", role: "Market & competitor researcher", autonomyInherited: 2 }
  - { profileId: "hermes-builder.suivia.brief-writer", role: "Brief composer", autonomyInherited: 3 }
  - { profileId: "hermes-operator.suivia.qa", role: "Brief QA + delivery", autonomyInherited: 3 }
  - { profileId: "hermes-money.suivia.tracker", role: "Spend & MRR tracker", autonomyInherited: 2 }

skills:
  - opportunity.scan
  - lead.triage
  - offer.generate
  - followup.sequence
  - brief.compose
  - signal.collect.public
  - data.synthesize

tools:
  - supabase.read
  - supabase.write.subscriptions
  - calendar.read
  - filesystem.workspace
  - llm.anthropic
  - llm.openai

budget:
  monthlyCents: 50000
  consumed: 0
  burstUsed: 0

autonomyLevel: 3
reportingTo: joris
reportCadence: weekly

promotionRequirements:
  - targetLevel: 4
    requires:
      consecutiveCleanMissions: 20
      noRedTeamFlagsForDays: 30
      ownerApproval: true
      riskOfficeApproval: true
  - targetLevel: 5
    requires:
      consecutiveCleanMissions: 30
      noRedTeamFlagsForDays: 30
      mrrThresholdCents: 100000
      ownerApproval: true
      riskOfficeApproval: true
```

---

## 8. Open-Source Pattern Intake

> Note : l'analyse approfondie des repos avec licences, stars et footguns vit dans le document compagnon `analyse_strategique_cto.md`. Cette section liste **les patterns architecturaux à voler**, pas les dépendances à installer. Aucune dépendance n'est introduite par ce document.

### 8.1 ChatDev

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| Le concept de "rôles d'entreprise virtuelle" (CEO, CTO, designer, programmeur, tester) avec workflow inter-rôles structuré | Pas de pipeline cinématographique linéaire — trop rigide pour des ventures B2B en évolution | Inspiration pour la composition des **sous-agents par Company Charter** (rôles spécialisés, sortie typée d'un rôle = entrée typée du suivant) |

### 8.2 CrewAI

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| Le triplet **Crew / Agent / Task** + délégation explicite | La pulsion à "déléguer librement" sans gates — CrewAI laisse trop de liberté à un orchestrateur LLM | Modèle de **délégation Agent CEO → sous-agents**, mais avec gate Mission obligatoire à chaque transition |

### 8.3 LangGraph

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| **State machine explicite** + checkpoints + **human-in-the-loop interrupt** | Verbosité Python lourde — on n'importe pas LangGraph côté Next.js | Pattern : représenter le cycle de vie Mission et Charter (`draft → ratified → active → paused`) comme une state machine typée avec interrupts sur risk=high |

### 8.4 MetaGPT

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| **SOP-first workflows** — chaque rôle suit une procédure standardisée documentée | L'illusion qu'on peut générer un produit complet en un prompt | Chaque **skill** d'une Charter doit avoir une SOP écrite (entrée/sortie/critères de succès) — pas de prompts ad-hoc en production |

### 8.5 AutoGen (Microsoft)

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| Spec d'agents + conversation multi-agents avec terminaison contrôlée | La "GroupChat" libre où n agents jasent sans contrat — coûts et hallucinations explosent | Format de **conversation Agent CEO ↔ sous-agent** : tour-par-tour, terminé par sortie typée, budget tokens cap |

### 8.6 SuperAGI

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| Monitoring d'agents + resource budgets + concept d'**Agent OS** | UI lourde, déps lourdes ; ne pas adopter le runtime tel quel | Pattern de **resource budgets** par Agent CEO (tokens, API calls, $) — déjà partiellement dans le Mission model |

### 8.7 RepoMaster-style (repo pattern extraction)

| Quoi voler | Quoi éviter | Où ça s'insère |
|------------|-------------|----------------|
| Méthode : extraire des **patterns** (signatures de fonctions, contrats, état) plutôt que copier du code | Copier les implémentations | Avant chaque intégration OSS : produire un **Pattern Extraction Memo** (1 page) avant d'écrire la moindre ligne |

### 8.8 Doctrine d'intake OSS

1. Aucun pip/npm install qui n'est pas justifié par un Pattern Extraction Memo.
2. Préférer **TypeScript-native ou pattern réimplémenté** plutôt qu'adoption d'une dépendance Python lourde.
3. Licence d'usage commercial obligatoire (MIT, Apache 2.0, BSD). **Refus** : AGPL, SSPL, BUSL pour le runtime de production.
4. Chaque intake OSS = nouvelle entrée au Ledger.

---

## 9. Hostinger / Agile Hermes Intake

> Inventaire et plan d'import contrôlé pour Hostinger et tout déploiement Agile Hermes existant.

### 9.1 Inventaire à produire (checklist)

| Item | Statut | Action |
|------|--------|--------|
| Liste des agents existants (Hermes Scout, Builder, Closer…) sur Hostinger | À inventorier | `docs/HOSTINGER_INTAKE.md` |
| Prompts associés à chaque agent | À extraire | Export en YAML versionné |
| Workflows déployés (cron, triggers, webhooks) | À inventorier | Listing + risque par workflow |
| Outils installés (n8n, Make, scripts perso) | À inventorier | Inventaire + licences |
| Credentials et tokens stockés | À auditer | Rotation obligatoire + secrets manager |
| Données persistées (DB, fichiers) | À cartographier | RGPD/Loi 25 audit |
| Logs et historique d'exécution | À récupérer | Backup avant tout démantèlement |
| Coûts mensuels actuels | À chiffrer | Comparaison avec budgetCap Charter |

### 9.2 Risques d'intake

| Risque | Sévérité | Mitigation |
|--------|----------|------------|
| Credentials exposés/réutilisés | Haute | Rotation complète avant import + audit Risk Office |
| Workflows actifs sans propriétaire identifié | Haute | **Pause** tout workflow non gouverné avant migration |
| Données client non conformes Loi 25 | Haute | Audit privacy avant tout import en Supabase |
| Coûts cachés (cron qui spawn des appels API) | Moyenne | Estimation $/mois par agent avant adoption |
| Dérive d'agent non détectée | Moyenne | 30 jours de shadow mode (read-only) avant activation |

### 9.3 Décisions d'intake (par défaut)

- **Importer** : prompts (yaml), schémas de données, workflows documentés.
- **Adapter** : SOPs, scripts d'orchestration → réécriture sous Mission model SOVRA.
- **Ignorer** : runtimes externes propriétaires (n8n/Make instances). Hostinger reste utilisable comme **hébergement web statique** uniquement ; aucun moteur d'agent ne tourne en dehors du runtime SOVRA.
- **Détruire** : credentials exposés, données non conformes, agents sans documentation.

### 9.4 Plan d'intake (1 mois)

```
S1: inventaire complet → docs/HOSTINGER_INTAKE.md
S2: audit credentials + privacy + rotation
S3: réécriture prompts/SOPs en format SOVRA + Pattern Extraction
S4: shadow mode read-only pour agents validés ; démantèlement du reste
```

---

## 10. Operating Flow

### 10.1 Flow nominal d'une décision

```
┌────────┐    intent    ┌────────┐
│Michael │ ───────────► │ Joris  │
└────────┘              └───┬────┘
                            │ route + planifie
                            ▼
                    ┌───────────────┐
                    │Company Charter│
                    │  + Agent CEO  │
                    └───────┬───────┘
                            │ ouvre Mission
                            ▼
                    ┌───────────────┐
                    │  Risk Gate    │ ◄──── consultation
                    │  (autonomy +  │       Risk Office si
                    │   risk check) │       risk = high
                    └───────┬───────┘
                            │ pass
                            ▼
                    ┌───────────────┐
                    │  Sub-agents + │
                    │    Skills     │
                    └───────┬───────┘
                            │ exécute (dry-run par défaut)
                            ▼
                    ┌───────────────┐
                    │    Runtime    │
                    │  (Oria HQ ou  │
                    │   VPS canary) │
                    └───────┬───────┘
                            │ écrit
                            ▼
                    ┌───────────────┐
                    │    Ledger     │
                    │ (append-only) │
                    └───────┬───────┘
                            │ rapporte
                            ▼
                    ┌───────────────┐
                    │  CEO Report   │
                    │ (cadence: see │
                    │   Charter)    │
                    └───────────────┘
```

### 10.2 Cas particuliers

- **risk=high** détecté → Joris **stoppe** la Mission, escalade au Risk Office. Pas de continuation tant que veto pas levé.
- **Budget burst dépassé** → Mission paused, demande de re-budget à Owner.
- **Sub-agent retourne une output non conforme au schéma** → Mission `failed`, entrée Ledger avec raison, démotion potentielle de l'agent.
- **Kill switch déclenché** → Charter passe en `paused`, toutes Missions en cours `cancelled`, Ledger snapshot pris.

### 10.3 Trois invariants

1. **Aucune action externe sans Mission ratifiée et risk gate passé.**
2. **Aucune Mission sans entrée Ledger.**
3. **Aucune modification de Charter sans double signature (Owner + Risk Office).**

---

## 11. Risk Register

| ID | Risque | Probabilité | Impact | Mitigation | Owner |
|----|--------|:---:|:---:|------------|-------|
| **R-01** | Agents trop autonomes trop vite (saut d'autonomy non mérité) | Moyenne | Très élevé | Échelle 0-7 + cooldown 14j + double signature pour ≥ 5 | Risk Office |
| **R-02** | Risk Office non indépendant (Owner = Risk Office) | Élevée (configuration initiale) | Élevé | Séparation des "hats" formalisée + Hermes Auditor en read-only + audit trimestriel externe à 1 an | Owner |
| **R-03** | Joris contourne les gates (orchestrateur s'auto-approuve) | Faible | Très élevé | Joris ne peut pas écrire son propre `riskGatePassed=true` ; gate écrit par module séparé | Architecture |
| **R-04** | Sub-agents non gouvernés (drift hors Charter) | Moyenne | Élevé | Héritage strict des contraintes parent + monitoring Hermes Auditor | Agent CEO |
| **R-05** | VPS branché sans contrat (runtime live avant Red Team pass) | Moyenne | Très élevé | Phase 4 (Runtime live) interdite jusqu'à Red Team sign-off explicite ; `smoke:runtime` reste echo-only | Owner |
| **R-06** | AI spend non plafonné (token usage explose) | Élevée | Moyen-Élevé | budgetCap par Charter + burst limité + alerte à 70% + kill switch à 110% | Hermes Money |
| **R-07** | Outreach externe trop tôt (spam, plainte, blacklist) | Élevée | Très élevé | `skillsForbidden: [email.send.external, sms.send, linkedin.dm]` en v1 ; Closer locked level 2 | Risk Office |
| **R-08** | Migrations non signées (DB schema change sans review) | Moyenne | Élevé | Phase gate existant + `MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` ratifié avant tout migrate | Owner |
| **R-09** | Providers IA non audités (clés API exposées, ToS violés) | Moyenne | Élevé | Audit ToS pour chaque provider + secrets manager + rotation 90j | Hermes Auditor |
| **R-10** | Loi 25 (QC) / RGPD non respectée sur données client | Moyenne | Très élevé | Audit privacy avant intake + chiffrement at-rest (Supabase) + opt-in explicite client + DPO log | Risk Office |
| **R-11** | Hallucination de signal marché présentée comme fait à un client | Élevée | Très élevé | Tous briefings = sources citées ; brief.compose interdit sans `signal.collect.public` traçable | Agent CEO |
| **R-12** | Concentration sur 1 venture qui échoue → pas de runway | Moyenne | Élevé | Diversification obligatoire dès 2e venture ratifiée + cash buffer ≥ 3 mois opex | Owner |
| **R-13** | Owner épuisé / single point of failure humain | Élevée | Très élevé | Joris doit pouvoir présenter un Daily Brief autonome ; runbook de continuité à 30j d'absence | Owner |
| **R-14** | Charter ratifiée sans P&L réaliste (CAC > LTV) | Moyenne | Élevé | Risk Office refuse ratification si LTV/CAC < 3 | Risk Office |
| **R-15** | Lock-in sur un seul provider LLM | Moyenne | Moyen | `skills` doivent être portables ; abstraction provider dans le runtime (déjà partielle) | Architecture |

---

## 12. 30-Day Execution Plan

### Semaine 1 — Doctrine + Schémas

| Jour | Livrable | Validation |
|------|----------|-----------|
| J1 | **Cette PR mergée** (`docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md`) | Review Owner + Risk Office |
| J2 | Update README pour pointer SOVRA Operating Model | `npm run lint` |
| J3 | `docs/COMPANY_CHARTER_SCHEMA.md` — proposition Zod typing | `npm run typecheck` |
| J4 | `docs/AGENT_CEO_CHARTER_SCHEMA.md` — typing proposal | `npm run typecheck` |
| J5 | `docs/HOSTINGER_INTAKE.md` — checklist remplie | Review Owner |

**Hors scope semaine 1 :** aucun code TS ; aucune migration ; aucun endpoint.

### Semaine 2 — Première Charter & Risk Office

| Jour | Livrable | Validation |
|------|----------|-----------|
| J8 | Company Charter `suivia.revenue-intelligence` ratifiée (yaml dans `docs/charters/`) | Signature Owner + Risk Office |
| J9 | Agent CEO Charter `hermes-scout.suivia` ratifiée | Signature Owner + Risk Office |
| J10 | `docs/RISK_OFFICE_CHARTER.md` — composition, mandat, processus de veto | Review Owner |
| J11 | Skills mapping pour Suivia (`opportunity.scan`, `lead.triage`, `brief.compose`…) — specs seulement | Review |
| J12 | Premier brouillon de brief (dry-run, no client) — qualité ≥ 0.7 | Review Owner |

### Semaine 3 — Sub-agents & test revenu

| Jour | Livrable | Validation |
|------|----------|-----------|
| J15 | Sub-agent model documenté + 4 sub-agents Suivia listés (Charters) | Review |
| J16 | Skills per company mapping (matrice) | Review |
| J17 | Outreach manuel (par Michael, pas par agent) à 20 cliniques cibles | KPI : 20 prospects analysés |
| J18 | 5 prospects qualifiés | KPI : 5 qualifiés |
| J19 | 3 conversations commerciales conduites | KPI : 3 calls |
| J20-21 | 1 offre vendable + 1 brief sample envoyé à 3 prospects | KPI : 1 offre vendable |

### Semaine 4 — Runtime canary + bilan

| Jour | Livrable | Validation |
|------|----------|-----------|
| J22 | VPS canary : `runtime.health.echo` seulement (déjà couvert par `smoke:runtime`) | `npm run smoke:runtime` pass |
| J23 | **Pas** de live executor activé. **Pas** de outreach autonome. Confirmer dans le Ledger. | Audit Risk Office |
| J24 | Premier client signé (objectif ; pas garanti) | KPI MRR : 497$ |
| J25-28 | Bilan 30 jours + version 2 du Operating Model si décisions de pivot | PR de révision |

### Validation finale (J30)

À exécuter avant tout merge associé à cette PR :

```bash
npm run typecheck
npm run lint
npm run build
npm run smoke:joris
npm run smoke:runtime
```

Statut attendu : 5/5 pass. Aucune régression sur les modules existants (cette PR étant docs-only, les 5 doivent passer sans modification de code).

---

## 13. Final Decision

### 13.1 Ce qu'on construit MAINTENANT

- Cette PR (doctrine SOVRA).
- Schéma Charter + Agent CEO Charter (docs).
- Risk Office Charter (docs).
- Company Charter `suivia.revenue-intelligence` rédigée + ratifiée.
- Outreach **manuel par Michael** vers 20 cliniques cibles QC/ON.
- VPS canary `runtime.health.echo` UNIQUEMENT.
- Hostinger Intake Checklist (inventaire).

### 13.2 Ce qu'on met EN PAUSE

- Toute écriture de code Mission Domain Model (Phase 1 du ROADMAP) jusqu'à ce que la Charter Schema soit ratifiée.
- Tout live executor.
- Tout intake Hostinger non audité.
- Toute autre venture (MVP Factory, Automation Ops, DADZCO Brand Lab, Lead Acquisition Desk) — focus exclusif Suivia tant que pas de 1er client payant.
- Toute multi-provider expansion (on opère avec Anthropic + OpenAI + Gemini déjà connectés, pas plus).

### 13.3 Ce qu'on OSE tester

- Vendre le brief **avant** que l'agent soit autonome. Premier client = livraison semi-manuelle (Agent CEO en autonomy 3, Owner valide chaque brief). Cash > perfection.
- Pricing **497 $/mois en abonnement** — pas de freemium, pas de POC gratuit > 1 brief.
- Une **offre vendable en un paragraphe**, testée auprès de 3 prospects en semaine 3, ajustée selon retour.

### 13.4 Ce qu'on REFUSE de merger

- Toute Charter sans signature Risk Office.
- Tout outreach automatisé externe avant Red Team pass.
- Toute migration DB sans `MISSION_PERSISTENCE_SCHEMA_PROPOSAL.md` ratifié.
- Toute dépendance OSS sous AGPL / SSPL / BUSL.
- Tout sub-agent plus permissif que son parent.
- Toute promesse de ROI chiffrée à un client par un agent.

### 13.5 Phrase à retenir

> Une holding agentique ne perd pas par manque d'ambition. Elle perd par manque de gates. SOVRA donne aux agents la licence d'opérer comme des CEOs — pas comme des stagiaires libérés.

---

## Appendix A — Glossaire

| Terme | Définition |
|-------|------------|
| **SOVRA** | Codename du modèle d'exploitation de la holding agentique. |
| **Oria HQ** | Surface (cockpit, workspace) qui matérialise SOVRA. |
| **Company Charter** | Statuts constitutifs d'une entreprise dans la holding. |
| **Agent CEO** | Agent dirigeant d'une et une seule venture. |
| **Sub-agent** | Employé spécialisé d'un Agent CEO. |
| **Risk Office** | Couche de veto indépendante du Owner et du Operating Partner. |
| **Risk Gate** | Condition bloquante évaluée avant exécution d'une Mission. |
| **Autonomy Level** | Niveau 0-7 sur l'échelle de permissions opérationnelles. |
| **Ledger** | Journal append-only de toutes les actions, décisions, dépenses. |
| **Kill Switch** | Mécanisme de pause/arrêt d'une Charter. |
| **Pattern Extraction Memo** | Document préalable à toute adoption OSS. |

## Appendix B — Références internes

- `docs/PRODUCT_MAP.md` — couches produit existantes
- `docs/ROADMAP.md` — phases de construction
- `docs/MISSION_MODEL_PROPOSAL.md` — unité de travail (Mission)
- `docs/ORIA_AGENT_OPERATING_MANUAL.md` — agents actifs
- `docs/ACTION_LEDGER_MISSION_TRACEABILITY.md` — Ledger
- `docs/PERMISSION_POLICY_CONSOLIDATION.md` — permissions
- `docs/ORIA_RUNTIME_CONTRACT.md` — runtime
- `docs/ORIA_VPS_RUNTIME_READINESS.md` — VPS canary
- `docs/MISSION_CONTROL_RED_TEAM_REVIEW.md` — Red Team
- `analyse_strategique_cto.md` (compagnon hors-repo) — analyse marché + repos OSS + GTM

---

*Document docs-only. Aucun code introduit. Aucune migration. Aucun endpoint. Aucune dépendance.*
