# Decision Log — Oria HQ

Registre des décisions produit et architecturales. Chaque entrée est immuable une fois fusionnée.

---

## 2026-06-12 — Naming canonique : « Oria » (marque) vs « Orya » (namespace technique gelé)

**Décision :** Le nom produit / affichage est **Oria HQ** — c'est le naming dominant du code
(68 occurrences dans `src/`, toutes les surfaces UI : `/hq`, agents, runtime, outbound, contact) et
d'`AGENTS.md`. Aucune surface utilisateur n'affiche « Orya ».

La graphie **Orya** est conservée **uniquement** comme namespace technique gelé et ne doit jamais
être renommée (cf. `docs/AGENT_NAMING.md` règle 1 « les IDs techniques ne se renomment jamais ») :

- En-têtes de dispatch / HMAC : `x-orya-action-ref`, `x-orya-timestamp`, `x-orya-signature`,
  `X-Orya-Idempotency-Key` (`skill-dispatcher.ts`, `resend-email-adapter.ts`). Les renommer
  casserait la vérification de signature et l'idempotence côté runtime — zone interdite.
- Seed de ventures : `ORYA_VENTURES`, `ventureId: "orya-hq"` (`llm-cash-action-packet-generator.ts`,
  `active-venture-contexts.ts`).
- Statut/tier : `Original Orya` (`originalOryaEligible`, `originalOryaCandidate`).

**Conséquence :** ne pas faire de rename de masse Oria⇄Orya. Toute nouvelle surface utilisateur
écrit « Oria ». Les docs dont le titre disait « Orya HQ » comme **nom produit** sont alignées sur
« Oria HQ » au fil des éditions (ce registre inclus). Cette entrée existe pour stopper la churn de
renommage qui a coûté des tokens en sessions précédentes.

**Références :** `AGENTS.md`, `docs/AGENT_NAMING.md`, `src/app/hq/page.tsx` (eyebrow « Oria · Michael HQ »)

---

## 2026-06-10 — Send Desk multi-canal : mode `ceo_single_send`

**Décision :** Mandat CEO explicite (session du 10 juin 2026). Le HQ obtient sa première voie
d'exécution réelle : le **Send Desk**, une file d'envoi multi-canal (Email via Resend, SMS via
Twilio) où chaque envoi est déclenché par un clic CEO sur une action individuelle. Le mode
`ceo_single_send` est ajouté à la Revenue Execution Lane : plus strict que le Yellow batch —
l'approbation ET le déclenchement sont humains, une action à la fois.

**Ce qui s'ouvre :** envoi email live (audit-cadeau Loi 96 + relances) via bridge Resend ;
SMS sortant limité aux leads ayant déjà répondu ; alerte SMS interne à Michael sur réponse
entrante (Green, notification interne). Architecture channel-agnostic : interface
`OutboundChannel`, adapters par fournisseur.

**Ce qui reste verrouillé :** SMS froid (Red structurel au policy engine), envoi initié par
agent, boucles batch automatiques, paiements, budgets ads. `requiresManualSend` et
`noExecutionAuthorized` restent forcés à `true` au niveau DB — le clic CEO **est** l'envoi manuel.

**Clarification d'invariant :** l'invariant Hermès « jamais de Resend en envoi » est précisé :
il interdit l'envoi *initié par agent*. Un envoi déclenché par clic CEO dans le Send Desk
satisfait `requiresManualSend`.

**Références :** `docs/REVENUE_EXECUTION_LANE.md` §3.1, `docs/HERMES_ITERATIVE_PREP_AGENT.md` §0.

---

## 2026-06-04 — Agent Autonomy Policy

**Décision :** Formalisation de l'Agent Autonomy Policy (PR-A). La politique sépare strictement l'AutonomyTier de l'AgentExecutionLicense. Les actions autonomes (green) requièrent la validation de 13 conditions strictes, incluant notamment un plan de rollback testé ("réversible" ne signifie pas seulement "petit"). La base de données en production n'est pas automatiquement "red" (les écritures en ajout seul comme le ledger peuvent être "green").

**Principes de sécurité :** Un superviseur LLM peut uniquement réduire le risque (downgrade), jamais contourner un blocage déterministe. Par défaut, l'inconnu n'est jamais "green" (fail-safe exigeant BLOCK ou REQUIRE_APPROVAL). De plus, les corridors "green" sont non-composables avec un plafond d'effet global pour éviter les combinaisons dangereuses. La promotion est gouvernée, la rétrogradation peut être automatique.

**Ce qui reste verrouillé :** Aucune intégration Mastra ou runtime n'est incluse (hors périmètre). Aucun effet de bord réel n'est débloqué par cette PR purement documentaire.

**Références :** `docs/AGENT_AUTONOMY_POLICY.md`, `.agents/rules/orya-agent-autonomy-policy.md`

---

## 2026-06-03 — Revenue Execution Lane v2

**Décision :** Orya devient un Revenue Execution OS borné. La première voie d'exécution live est
la communication sortante (outbound), dans des corridors approuvés, observables et réversibles.

**Ce qui s'ouvre :** outbound warm-first (reply_assist → follow_up → re_activation → cold_email).

**Ce qui reste verrouillé :** paiements, déploiements, budgets ads, écritures DB de production,
intégrations externes nouvelles, endpoint runtime public.

**Principe directeur :** Michael approuve un batch borné (volumeCap + sendWindow + contentHash),
jamais un agent. `noExecutionAuthorized` reste l'état par défaut hors corridor.

**Références :** `docs/REVENUE_EXECUTION_LANE.md`, `docs/OUTBOUND_POLICY.md`

**Owner :** Michael Boyer
**PR :** PR-A (docs) → PR-B (contrats) → PR-C (Sentinelle) → PR-D (UI) → PR-E (bridge dry-run)

---

## 2026-06-03 — Memory Vault (T3)

**Décision :** Le Memory Vault est le layer de mémoire opérationnelle workspace-scoped pour Joris.
Seules les entrées `verified` sont injectées dans le contexte Joris au démarrage de chaque invocation.
Joris peut proposer (trustLevel: proposed) mais ne peut pas écrire directement.

**Références :** `docs/MEMORY_VAULT_CONTRACT.md`, `src/server/memory/`

---

## 2026-06-03 — Production fail-fast Zod

**Décision :** `server-env.ts` valide toutes les vars au boot via Zod. En production, un fail-fast
throw si les vars critiques sont absentes. Le fail-fast est skippé pendant `next build`
(`NEXT_PHASE=phase-production-build`) pour ne pas bloquer le CI.

**Références :** `src/lib/server-env.ts`

---

## 2026-06-03 — Rate limiting Upstash adaptatif

**Décision :** `rate-limit.ts` utilise Upstash Redis quand les env vars sont présentes, sinon
fallback in-memory. La signature publique `isAllowed()` est identique dans les deux modes.

**Références :** `src/lib/rate-limit.ts`

---

## 2026-05-20 — Phase 1 verrouillée

**Décision :** Phase 1 (workspace-specific runtime adapters, permission execution, workspace
configuration) ne démarre pas sans mandat explicite de Michael.

**Références :** `AGENTS.md#what-remains-to-build`
