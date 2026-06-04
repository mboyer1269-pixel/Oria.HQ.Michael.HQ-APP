# Revenue Execution Lane — v2

**Status:** Doctrine / décision produit (PR-A, docs-only)
**Owner:** Michael Boyer (President / Capital Allocator)
**Operating Partner:** Joris (orchestrateur)
**Supervisor:** Sentinelle (policy engine)
**Scope:** Première voie d'exécution réelle d'Orya HQ — outbound, relance, prospection — bornée par corridors approuvés.

> ⚠️ Ce document décrit un modèle opérationnel et technique. Il ne constitue pas un avis juridique.
> Les règles de conformité (CASL, CAN-SPAM, RGPD) doivent être validées avec un conseiller qualifié
> avant tout envoi live.

---

## 1. Décision produit

Orya cesse d'être un cockpit *planning-only*. Il devient un **Revenue Execution OS borné** : les agents
peuvent exécuter des actions génératrices de revenu, **mais uniquement à l'intérieur de corridors
approuvés, observables et réversibles**.

Le pivot tient en une phrase :

> Les agents peuvent agir en live, mais seulement dans les corridors autorisés, et chaque action produit une preuve.

Ce qui ne change pas : `noExecutionAuthorized` reste l'état par défaut hors corridor. Paiements,
déploiements, budgets ads, écritures DB de production, intégrations externes nouvelles → **restent
verrouillés**. La Revenue Execution Lane ouvre **une seule** porte : la communication sortante, sous
gouvernance.

---

## 2. Principe directeur : warm-first, cold-last

Le revenu ne naît pas de l'envoi. Il naît de la **réponse et de sa conversion**. La prospection à
froid est la sous-voie la plus risquée (réputation domaine, consentement CASL opt-in, signal spam) et
la moins convertissante.

**Ordre de mise en live à l'intérieur de la lane :**

| Phase | Sous-voie | Consentement | Risque réputation | Défaut policy |
|-------|-----------|--------------|-------------------|---------------|
| 1 | `reply_assist` — réponse à un lead qui a déjà répondu | implicite réel | quasi nul | **Green** (interne) / Yellow (client-facing) |
| 2 | `follow_up` — relance d'un lead tiède/connu | implicite/existant | faible | **Yellow** (batch) |
| 3 | `re_activation` — réveil d'un contact dormant qualifié | à vérifier | moyen | **Yellow** (batch) |
| 4 | `cold_email` — prospection froide | exprès ou implicite vérifié | élevé | **Yellow strict → Red** si non conforme |

Le cold est le **boss de fin**, pas le tutoriel. On valide la boucle complète (envoi → preuve → score)
sur le warm avant d'ouvrir le cold.

---

## 3. Modèle Green / Yellow / Red (outbound)

- **Green — exécution autonome :** actions internes/test, ou actions client-facing déjà couvertes par
  un batch approuvé non expiré, à un destinataire connu, sous les caps de réputation. Aucune
  approbation supplémentaire.
- **Yellow — batch approval :** toute action client-facing nouvelle. Michael approuve un **lot borné**
  (pas un agent, pas un message individuel). Le batch porte des limites dures (cf. §5).
- **Red — bloqué :** consentement inconnu sur cold, destinataire sur liste de suppression, disclaimer
  requis absent, lot au-delà du cap dur, contenu modifié après approbation, état de réputation dégradé
  (circuit-breaker ouvert).

Règle d'or : **Michael approuve un batch borné, jamais un agent.**

---

## 4. Machine à états (lifecycle) — backbone obligatoire

Toute action et tout batch ont un cycle de vie explicite. C'est le squelette qui rend possibles la
pause en vol, la réconciliation et l'audit. **Doit exister dès PR-B.**

```
OutboundBatch:
  drafted
    → policy_checked        (Sentinelle a rendu une PolicyDecision)
    → pending_approval       (en attente de Michael)
    → approved               (approvalToken émis, lié au contentHash)
    → executing              (envoi en cours via le bridge)
    → paused                 (kill-switch en vol OU circuit-breaker réputation)
    → completed
    → expired                (fenêtre dépassée OU contenu modifié → token mort)
    → blocked

OutboundAction (une par destinataire):
  queued
    → sent
    → delivered | bounced
    → outcome_captured       (reply / booked_call / signed_loi / stripe_charge / unsubscribe)
    → closed
    → orphaned               (callback jamais reçu → réconciliation requise)
```

Exigences :
- **Kill-switch en vol :** un batch en `executing` peut passer en `paused` ; les actions encore
  `queued` ne partent pas.
- **Réconciliation :** une action `sent` sans callback dans la fenêtre → `orphaned`, jamais renvoyée
  automatiquement (anti double-envoi).
- **Idempotence :** chaque action porte une clé idempotente ; un callback rejoué ne crée pas de
  doublon ni de double-comptage de preuve.

---

## 5. Contrats (voir `docs/OUTBOUND_POLICY.md` pour la spéc complète)

### 5.1 Séparation Batch / Action

`OutboundAction` (l'email rendu pour **un** destinataire) est distinct d'`OutboundBatch` (template +
audience + politique — ce que Michael **approuve**).

Invariants :
- Impossible d'approuver un batch sans `contentHash`.
- `approvalToken` invalide dès que `contentHash` change → état `expired`.
- Impossible de rendre une `OutboundAction` si une `personalizationSource` n'a pas de référence
  vérifiable → pas de personnalisation inventée.
- `consentBasis: "unknown"` → batch bloqué.

### 5.2 PolicyDecision

```ts
type PolicyDecision = "ALLOW" | "REQUIRE_APPROVAL" | "BLOCK"
```

Inputs : agent license · subVoie · audienceType · recipientCount · consentBasis & consentProvenance ·
disclosure presence · unsubscribe presence · jurisdiction · riskLevel · prior approval (token
valide ?) · **suppression check** · **reputation/throttle state** · token budget state.

### 5.3 SuppressionEntry

Vérifié AVANT chaque envoi. Types : `unsubscribed` | `hard_bounce` | `complaint` |
`in_conversation` | `existing_customer` | `competitor` | `manual`.

### 5.4 ReputationState

Caps mailbox/domaine, warmup ramp, circuit-breaker bounce/plainte avec pause auto en vol.
Si `rollingBounceRate` ou `rollingComplaintRate` dépasse le seuil **en cours d'envoi**, le
`circuitBreaker` passe `open` → batch `paused`, actions `queued` ne partent pas.

### 5.5 AgentBudgetGuard + OrgBudgetGuard

Plafonds agent (dailyTokenBudget, dailyUsdBudget, maxLoopsPerTask, repetitionDetection) ET plafond
org global (dailyUsdCap, monthlyUsdCap). Les deux doivent être satisfaits.

### 5.6 ModelRoutingPolicy

- Aucun modèle hardcodé dans le runtime.
- Chaque appel agentique logue `modelUsed`, `costEstimate`, `taskType`.
- **Évaluateur ≠ producteur** : le modèle qui juge ne peut être la même instance que celui qui a produit.
- `modelUsed` logué à côté de l'EvidenceRef servie.

---

## 6. Trust model EvidenceRef pour l'outbound

| Famille | Types | Effet sur le score |
|---------|-------|--------------------|
| **Delivery telemetry** | `email_sent`, `email_bounce` | aucun crédit cash |
| **Engagement** | `email_opened`, `email_clicked` | **aucun effet** (Apple MPP fausse les opens) |
| **Outcome** | `email_reply` → `booked_call` → `signed_loi` → `stripe_charge` | crédit cash uniquement sur `signed_loi` / `stripe_charge` |
| Faible | `unsubscribe`, `manual_note` | jamais du revenu |

**Attribution :** chaque `email_reply` doit référencer le `threadId` / `OutboundAction` qui l'a causée.
Sans corrélation, pas de fermeture de boucle ni de scoring honnête.

---

## 7. Conformité par juridiction

`validateOutboundCompliance()` est multi-régime :

- **CASL (Canada) — opt-in :** consentement exprès, ou implicite *réel* (relation d'affaires
  existante, adresse publiée pertinente au rôle, fenêtre généralement 6 mois). Régime le plus strict.
- **CAN-SPAM (US) — opt-out :** identification, en-tête honnête, adresse physique, désabonnement
  honoré sous 10 jours.
- **RGPD (UE) :** base légale (intérêt légitime documenté ou consentement), droit d'opposition.

Un `implied_verified` sans EvidenceRef de provenance → traité comme `unknown` → BLOCK.

**Le disclaimer IA n'est PAS une obligation légale** sous CASL/CAN-SPAM. C'est un choix d'éthique et
de marque, rangé en couche policy/éthique (ne pas rendre le système cassant sur une fausse obligation).

Disclaimers recommandés par défaut :
- Assisté : « Ce message a été préparé avec l'aide de l'équipe IA d'Orya HQ. »
- Entièrement automatisé : « Ce message a été généré et envoyé par l'équipe IA d'Orya HQ, sous supervision humaine. »

---

## 8. Work Orders (12)

| WO | Titre | PR |
|----|-------|----|
| WO-01 | Revenue Execution Lane Operating Model | PR-A |
| WO-02 | Outbound Batch + Action Contracts | PR-B |
| WO-03 | Batch Approval for Outbound | PR-B |
| WO-04 | Compliance Guard (multi-juridiction) | PR-C |
| WO-05 | Sentinelle Outbound Policy Engine | PR-C |
| WO-06 | EvidenceRef for Outbound Outcomes | PR-B |
| WO-07 | n8n Execution Bridge (dry-run) | PR-E |
| WO-08 | Token Budget Guard (+ org cap) | PR-B |
| WO-09 | Model Routing Policy | PR-B |
| WO-10 | Skill Import Gate | PR-B |
| WO-11 | Reputation & Throttle Guard | PR-B |
| WO-12 | Suppression Registry | PR-B |

### WO-07 — précision critique (callback entrant)

Le webhook sortant (Orya → n8n) est signé. Le callback entrant (n8n → Orya) **doit l'être aussi** +
idempotency key. Sinon n'importe qui peut POST un faux `stripe_charge` dans le ledger.
`n8n ne décide jamais ; il exécute ce qu'Orya a approuvé.`

### WO-11 — circuit-breaker

Si `rollingBounceRate` ou `rollingComplaintRate` dépasse le seuil en cours d'envoi, le
`circuitBreaker` passe `open` → batch `paused` automatiquement. Un domaine brûlé tue la venture
entière ; ~22 % des emails B2B légitimes n'atteignent déjà jamais l'inbox.

---

## 9. Séquence de PR

- **PR-A — docs (ce document).** `docs/REVENUE_EXECUTION_LANE.md`, `docs/OUTBOUND_POLICY.md`,
  mise à jour du decision log.
- **PR-B — contracts (élargi).** `OutboundBatch` + `OutboundAction` + `PolicyDecision` +
  `SuppressionEntry` + `ReputationState` + machine à états, avec tests purs.
- **PR-C — Sentinelle.** `outbound-policy-engine.ts` (`canExecuteOutboundAction()`) + tests.
- **PR-D — UI batch approval.** `/hq/ventures/cash-actions` : voir batch, destinataires, risque,
  sample, disclaimer, consent basis, suppression hits, reputation state ; approuver / bloquer /
  réviser / limiter volume.
- **PR-E — Execution Bridge dry-run.** `outbound-executor-dry-run.ts` (aucun envoi live, callback
  signé simulé) + tests.

---

## 10. Invariants non négociables

- Les agents peuvent **préparer** des actions outbound ; ils ne peuvent **pas** envoyer client-facing
  sans chemin policy approuvé.
- Batch approval > approbation message par message.
- Batch approuvé = **immuable** (enforced par `contentHash` / `approvalToken`). Contenu modifié →
  approbation expirée.
- Toute action outbound écrit dans l'**Action Ledger**.
- Tout résultat revient en **EvidenceRef** (callback signé, idempotent).
- `email_sent ≠ revenu`. Cash réel = `signed_loi` / `stripe_charge` uniquement.
- Suppression vérifiée **avant** envoi. Réputation surveillée **pendant** envoi.
- Aucun modèle hardcodé. Juge ≠ producteur.
- `humanOnTheLoop` préservé : Michael approuve des corridors bornés, pas des agents libres.

---

## 11. Hors scope v1

Pas d'envoi live. Pas de provider email branché en production. Pas de migration DB sans approbation
séparée. Pas de n8n live. Pas de paiements, déploiements, budgets ads, ni intégrations externes
nouvelles. Pas d'endpoint runtime public. Pas de secrets côté client. Pas de bypass RLS.
