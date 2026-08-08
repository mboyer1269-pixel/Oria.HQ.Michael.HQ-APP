# Michael HQ — Go-To-Market (Launch Strategy)

**Status:** Ready for launch prep after merge of `cursor/validation-ethical-billing-41b2`  
**Product wedge:** Sovereign operator platform — evidence before build, portable IaC, usage-only billing (0% revenue share).

---

## 1. Positioning (one sentence)

> Oria / Michael HQ is the CEO cockpit where AI proposes, you decide, the ledger proves it — with portable infrastructure and transparent usage pricing, never a tax on your upside.

### Competitive kill shots

| Competitor trap | Michael HQ answer |
|---|---|
| Vendor lock-in (hosted runtime only) | Engineering Agent delivers Docker/Terraform/GitHub-ready packages you own |
| Hidden AI markups / 20% take-rate | `revenueSharePercent = 0` — usage cents only, after CEO APPROVE |
| Build before demand | Validation Agent mandatory demand-check (TAM/SAM/SOM) before engineering budget |
| Opaque agent spend | `/hq/finance` + `estimated_cost` on the approval rail |

---

## 2. Ideal customer profile (ICP)

**Primary (beachhead):** Solo founders / operator-CEOs (technical or tech-adjacent) who:
- Already pay for multiple AI tools and hate opaque bills
- Need agents that prepare work but never ship without them
- Want infra they can clone to their own cloud

**Secondary (30–60 days):** Small studios / holding companies (2–10 people) running multiple ventures under one approval cockpit.

**Not now:** Enterprises needing SSO/SCIM in week one; pure no-code marketers.

---

## 3. Offer & pricing (ethical)

| Product | Price | What they get |
|---|---|---|
| **Michael HQ Core** | Platform fee TBD (flat or seat) + **usage wallet** | Cockpit, Validation + Engineering agents, HITL theatre, ledger |
| **Usage** | Exact algorithmic cost (tokens + external APIs) | Debited only after CEO APPROVE — shown before click |
| **Revenue share** | **0%** | Explicit doctrine — never a % of customer project revenue |

Script (30 seconds):

> “Your agents prepare the work. You approve. You see the cost to the cent before you click. When we generate infra, you download portable Docker/Terraform — not a hostage runtime. We never take a cut of what you earn.”

---

## 4. Launch sequence (21 days)

### Days 1–7 — Proof & narrative
1. Merge PR → apply hash-chain migrations 0022/0023 → set `LEDGER_HMAC_KEY`.
2. Record a 3-minute Loom of the E2E path: Validation → cost on rail → APPROVE → Engineering → export → `/hq/finance`.
3. Publish manifesto post: *“We refuse the 20% AI tax.”* Link Loom + waitlist.

### Days 8–14 — Design partners (5 conversations)
1. Target: founders burned by locked agent platforms / opaque LLM bills (LinkedIn + personal network).
2. Offer: free design-partner seat for 30 days in exchange for a public case note.
3. Success criteria: ≥3 complete the Validation → Engineering → Export path without help.

### Days 15–21 — Soft launch
1. Open waitlist / paid early access with usage wallet top-up.
2. Ship weekly changelog from `/hq/finance` honesty (sample anonymized cost lines).
3. One channel only until message sticks: LinkedIn founder outbound + personal network intros.

---

## 5. Acquisition channels (ordered)

1. **Founder outbound (primary)** — “I built the anti-lock-in CEO cockpit” + Loom.
2. **Proof content** — screenshots of approval rail cost + finance dashboard (no fake stats).
3. **Partner intros** — agencies / studios who lose margin to opaque AI platforms.
4. **Later:** Product Hunt only after 3 design-partner quotes.

---

## 6. Launch KPIs (first 30 days post-merge)

| Metric | Target |
|---|---|
| Design-partner calls booked | 10 |
| Completed E2E cycles (Validation→Export) | 5 |
| Public proof assets (Loom + 1 case note) | 2 |
| Waitlist / early-access signups | 50 |
| Support tickets about “hidden fees” | 0 (policy invariant) |

---

## 7. Messaging do / don’t

**Do:** evidence, portable export, CEO click, cost-before-approve, 0% revenue share.  
**Don’t:** “fully autonomous agents,” fake TAM slides, percentage take-rates, “set and forget.”

---

## 8. Immediate next actions (CEO)

1. **Merge** `cursor/validation-ethical-billing-41b2` → `main`.
2. Run production E2E with real LLM keys (Validation propose → Approuve → Engineering propose → Export → `/hq/finance`).
3. Record the Loom; post the manifesto.
4. Book 5 design-partner calls this week.

The product doctrine is operational. The launch is a distribution problem now — not an engineering one.
