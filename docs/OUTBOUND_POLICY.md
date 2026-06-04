# Outbound Policy — Contrats & Specs Techniques

**Status:** Docs-only (PR-A)
**Implements:** Revenue Execution Lane §5 — voir `docs/REVENUE_EXECUTION_LANE.md`
**Canonical types (à créer en PR-B):** `src/server/outbound/`

---

## OutboundBatch

```ts
type BatchState =
  | "drafted"
  | "policy_checked"
  | "pending_approval"
  | "approved"
  | "executing"
  | "paused"
  | "completed"
  | "expired"
  | "blocked";

type OutboundSubVoie =
  | "reply_assist"
  | "follow_up"
  | "re_activation"
  | "cold_email";

type AudienceType =
  | "internal_test"
  | "known_contact"
  | "warm_lead"
  | "cold_prospect";

type ConsentBasis =
  | "express"
  | "implied_verified"
  | "manual_review_required"
  | "unknown";

type Jurisdiction = "CA" | "US" | "EU" | "other";

type OutboundBatch = {
  id: string;
  agentId: string;
  ventureId?: string;
  subVoie: OutboundSubVoie;
  audienceType: AudienceType;
  recipientCount: number;
  messageTemplate: string;          // template, pas message final
  aiDisclosure: string;             // couche policy/éthique (non obligation légale)
  consentBasis: ConsentBasis;
  consentProvenance: EvidenceRef[]; // d'où vient le droit de contacter — vérifiable
  unsubscribeMechanism: "present" | "absent";
  jurisdiction: Jurisdiction;
  riskLevel: "low" | "medium" | "high" | "critical";
  approvalMode: "none" | "batch" | "per_message" | "blocked";
  contentHash: string;              // hash(template + audience + policy)
  approvalToken?: string;           // lié au contentHash ; mort si le hash change
  sendWindow: { start: string; end: string }; // ISO 8601
  volumeCap: number;                // plafond dur d'envoi pour ce batch
  state: BatchState;
  createdAt: string;
  updatedAt: string;
};
```

### Transitions autorisées

```
drafted          → policy_checked   (Sentinelle.canExecuteOutboundAction())
policy_checked   → pending_approval (si REQUIRE_APPROVAL)
policy_checked   → approved         (si ALLOW + batch approval auto)
policy_checked   → blocked          (si BLOCK)
pending_approval → approved         (Michael signe l'approvalToken)
pending_approval → blocked          (Michael rejette)
approved         → executing        (bridge démarre l'envoi)
executing        → paused           (kill-switch Michael OU circuit-breaker réputation)
executing        → completed        (tous les destinataires traités)
approved         → expired          (sendWindow dépassée OU contentHash changé)
paused           → executing        (Michael relance, si token encore valide)
paused           → expired          (sendWindow dépassée)
```

---

## OutboundAction

```ts
type ActionState =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "outcome_captured"
  | "closed"
  | "orphaned";

type OutboundAction = {
  id: string;
  batchId: string;
  leadId: string;
  idempotencyKey: string;           // format: `${batchId}:${leadId}`
  actionType: OutboundSubVoie;
  renderedSubject: string;
  renderedBody: string;
  personalizationSources: EvidenceRef[]; // chaque perso référence une source réelle
  threadId?: string;                // pour attribuer la réponse
  modelUsed: string;                // modèle ayant rédigé — audit qualité
  costEstimateCents: number;
  state: ActionState;
  sentAt?: string;
  deliveredAt?: string;
  bouncedAt?: string;
  outcomeType?: OutboundOutcomeType;
  outcomeAt?: string;
  outcomeEvidenceRef?: EvidenceRef;
  createdAt: string;
  updatedAt: string;
};

type OutboundOutcomeType =
  | "email_reply"
  | "booked_call"
  | "signed_loi"
  | "stripe_charge"
  | "unsubscribe"
  | "manual_note";
```

### Règle anti double-envoi

Une `OutboundAction` en `sent` sans callback dans la fenêtre de réconciliation → `orphaned`.
**Jamais** renvoyée automatiquement. Requiert intervention manuelle ou décision de réenvoi explicite.

---

## PolicyDecision

```ts
type PolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";

type PolicyDecisionRecord = {
  decision: PolicyDecision;
  batchId: string;
  reasons: string[];          // liste des règles qui ont conduit à la décision
  checkedAt: string;
  suppressionHits: number;    // nombre de destinataires en suppression
  reputationWarnings: string[];
  consentIssues: string[];
  complianceFlags: string[];
};
```

Inputs évalués par `canExecuteOutboundAction()` :
1. Agent license (agent autorisé à faire de l'outbound ?)
2. subVoie (sous-voie dans le périmètre de la lane ?)
3. audienceType
4. recipientCount (vs volumeCap du batch + caps org)
5. consentBasis + consentProvenance (vérifiable ?)
6. aiDisclosure (présent ?)
7. unsubscribeMechanism (présent ?)
8. jurisdiction (règles applicables ?)
9. riskLevel
10. Prior approval (approvalToken valide et contentHash inchangé ?)
11. Suppression check (aucun destinataire en suppression ?)
12. Reputation state (circuitBreaker fermé ?)
13. Token budget (agent + org sous les caps ?)

---

## SuppressionEntry

```ts
type SuppressionReason =
  | "unsubscribed"
  | "hard_bounce"
  | "complaint"
  | "in_conversation"
  | "existing_customer"
  | "competitor"
  | "manual";

type SuppressionEntry = {
  id: string;
  contactKey: string;        // email ou domaine normalisé (lowercase, trimmed)
  reason: SuppressionReason;
  source: EvidenceRef;       // d'où vient l'info — vérifiable
  createdAt: string;
  workspaceId: string;       // suppression workspace-scoped
};
```

**Invariant :** Vérifiée **AVANT** chaque `OutboundAction` générée pour un destinataire.
Un hit → l'action ne passe pas à `queued`.

---

## ReputationState

```ts
type CircuitBreakerState = "closed" | "open";

type ReputationState = {
  mailboxId: string;
  domain: string;
  dailySentCount: number;
  dailyCap: number;                   // ramp-up / warmup progressif
  rollingBounceRate: number;          // 0.0 – 1.0
  rollingComplaintRate: number;       // 0.0 – 1.0
  circuitBreaker: CircuitBreakerState; // open = pause auto des envois sur ce domaine
  lastUpdatedAt: string;
};
```

Seuils recommandés (à confirmer avec conseiller avant go-live) :
- `rollingBounceRate > 0.05` → circuit-breaker `open`
- `rollingComplaintRate > 0.001` → circuit-breaker `open`
- Ramp-up : commencer à 20 emails/jour, doubler toutes les 2 semaines jusqu'au cap target.

---

## AgentBudgetGuard

```ts
type AgentBudgetGuard = {
  agentId: string;
  dailyTokenBudget: number;
  dailyUsdBudget: number;
  maxLoopsPerTask: number;
  maxRetries: number;
  repetitionDetection: {
    enabled: true;
    window: number;        // nombre d'actions à inspecter
    haltAfterK: number;    // halt si hash(action+input) vu K fois
  };
  escalationThreshold: number;
};

type OrgBudgetGuard = {
  dailyUsdCap: number;     // plafond global : attrape N agents sous budget qui crament le mois ensemble
  monthlyUsdCap: number;
};
```

---

## ModelRoutingPolicy

```ts
type ModelRoutingPolicy = {
  taskType: string;
  preferredModel: string;
  fallbackModel: string;
  maxCostCents: number;
  requiredReasoningLevel: "low" | "standard" | "high";
  criticalEvaluatorModel: string; // juge ≠ producteur
};
```

Règle **juge ≠ producteur** : le modèle qui évalue le travail d'un agent ne doit jamais être la même
instance/contexte que celui qui l'a produit, et doit être au moins aussi robuste.

⚠️ Les prix/modèles sont **à vérifier sur les pages officielles** avant implémentation. On ne bâtit
pas l'architecture sur des tarifs non validés.

---

## EvidenceRef (outbound — extensions)

Trust model pour l'outbound, en extension du ledger existant :

| Famille | Types | Confiance | Effet sur le score |
|---------|-------|-----------|--------------------|
| Delivery telemetry | `email_sent`, `email_bounce` | faible-moyenne | aucun crédit cash |
| Engagement | `email_opened`, `email_clicked` | **quasi nulle** (Apple MPP) | **aucun effet** |
| Outcome | `email_reply` → `booked_call` → `signed_loi` → `stripe_charge` | croissante | cash sur `signed_loi` / `stripe_charge` uniquement |
| Signal faible | `unsubscribe`, `manual_note` | faible | jamais du revenu |

**Attribution obligatoire :** chaque `email_reply` doit référencer le `threadId` de l'`OutboundAction`
qui l'a causée. Sans corrélation → pas de fermeture de boucle.

---

## Compliance guard — validateOutboundCompliance()

Multi-régime, jamais mono :

### CASL (Canada) — opt-in
- Consentement exprès OU implicite *réel* : relation d'affaires existante OU adresse publiée
  pertinente au rôle (fenêtre généralement 6 mois).
- Identification claire de l'expéditeur.
- Mécanisme de désabonnement fonctionnel.

### CAN-SPAM (US) — opt-out
- Identification + en-tête honnête.
- Adresse physique dans le message.
- Mécanisme de désabonnement honoré sous 10 jours.

### RGPD (UE)
- Base légale (intérêt légitime documenté ou consentement exprès selon le cas).
- Droit d'opposition honoré.

**Règle de provenance :** le système dérive le type de consentement de `consentProvenance`
(EvidenceRef vérifiable). Un label auto-attribué sans EvidenceRef → traité comme `unknown` → BLOCK.

---

## Invariants d'implémentation (PR-B+)

- `contentHash` calculé sur `hash(messageTemplate + audienceType + jurisdiction + consentBasis + aiDisclosure)`.
- `approvalToken` = `hash(contentHash + approverId + approvedAt)`. Invalidé si `contentHash` change.
- `idempotencyKey` pour chaque `OutboundAction` = `${batchId}:${leadId}`. Rejeu idempotent.
- Callback webhook entrant signé (HMAC) + `idempotencyKey` → pas de double-comptage de preuve.
- Toute `OutboundAction` écrit une entrée dans l'Action Ledger (eventType: `outbound.sent` etc.).
