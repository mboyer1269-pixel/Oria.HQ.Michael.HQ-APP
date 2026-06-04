# Decision Log — Orya HQ

Registre des décisions produit et architecturales. Chaque entrée est immuable une fois fusionnée.

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
