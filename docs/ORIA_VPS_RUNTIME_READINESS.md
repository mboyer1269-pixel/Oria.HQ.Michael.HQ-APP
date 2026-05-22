# Oria VPS Runtime Readiness Plan

Status: **PLAN** — no VPS provisioned, no Docker images, no runtime code.  
Date: 2026-05-21  
Branch at time of writing: `main` (post-PR #35)

---

## Purpose

This document is the readiness checklist for standing up a future agent runtime on a VPS. It builds directly on `docs/ORIA_RUNTIME_CONTRACT.md`. **Nothing here provisions infrastructure.** It defines *what would be needed*, in *what order*, with the live executor remaining locked throughout.

---

## Ratified Contract Decisions (CEO sign-off — 2026-05-21)

The 6 open questions from `docs/ORIA_RUNTIME_CONTRACT.md` are now resolved:

| # | Question | Decision |
|---|---|---|
| 1 | Signature scheme | **HMAC-SHA256** at start. mTLS / asymmetric later if needed. |
| 2 | Instruction TTL | **60s default.** Dry-run up to 120s. Future live: 30–60s. |
| 3 | Single runtime vs pool | **Single runtime node** to start. No pool until a proven need. |
| 4 | Heartbeat interval | **30s heartbeat.** Stale at 90s. Offline at 180s. |
| 5 | Event transport | **HTTP webhooks first.** WebSocket later for live monitoring. |
| 6 | Canary skill | **`runtime.health.echo`** — a no-risk echo, not `mission.plan` or `calendar.book`. |

These decisions are now binding for all runtime implementation PRs.

---

## Recommended VPS

| Attribute | Recommendation | Rationale |
|---|---|---|
| Provider | A single small VPS (e.g. Hetzner / DigitalOcean / OVH) | Cheap, predictable, easy to destroy & rebuild |
| Size | 1–2 vCPU, 2–4 GB RAM to start | Single node, single skill at a time — minimal load |
| Region | Closest to Oria HQ hosting + CEO (Québec → CA/US-East) | Latency + data residency |
| OS | Current LTS Linux (e.g. Ubuntu LTS) | Stable, well-documented |
| Lifecycle | Treat as cattle, not pets — fully reproducible from config | Rollback = rebuild |

No VPS is purchased until PR-gated provisioning, after this plan is ratified.

---

## Future Docker Architecture

```
VPS host
└── docker compose
    ├── runtime-agent        (single skill executor — the only privileged service)
    ├── runtime-gateway      (receives signed instructions from HQ, verifies sig + TTL)
    └── runtime-logger       (structured logs, ships to HQ-visible store)
```

- **One container executes skills.** The gateway never executes — it only verifies and forwards.
- **No secrets baked into images.** Secrets injected at runtime via environment, never committed.
- **Images are versioned and pinned.** No `latest` tags.

(Dockerfiles and compose files are written in a later PR — not now.)

---

## Runtime Services

| Service | Responsibility | Trust level |
|---|---|---|
| `runtime-gateway` | Verify HMAC signature, check `expiresAt`, enforce idempotency on `instructionId`, reject malformed | Boundary guard |
| `runtime-agent` | Execute exactly one skill per instruction, honor `outputConstraint`, sign result | Sandboxed executor |
| `runtime-logger` | Emit structured logs + correlate by `instructionId` | Observability |

The gateway and agent are separate so a compromised executor cannot forge inbound authorization.

---

## Environment & Secrets

| Item | Where it lives | Never |
|---|---|---|
| HMAC shared secret | Injected at runtime (env), rotated on schedule | Never in repo, never in image |
| HQ webhook URL + token | Runtime env | Never logged |
| Skill-specific tokens (future) | Short-lived, issued per-instruction by HQ | Never standing on the runtime |

**Immutable rule (unchanged):** never modify `.env`, secrets, API keys, or credentials in the repo. The runtime gets secrets through deployment-time injection only.

---

## DNS / Subdomain

| Item | Plan |
|---|---|
| Subdomain | e.g. `runtime.oria.<domain>` — dedicated, not shared with HQ |
| TLS | Managed certificate, auto-renew |
| Access | Locked to HQ origin + CEO admin IP during bring-up |

---

## Firewall

| Rule | Policy |
|---|---|
| Inbound | Only HQ origin (instruction dispatch) + admin SSH from CEO IP |
| Outbound | Deny-by-default; allowlist HQ webhook endpoint + any explicitly approved skill targets |
| Everything else | Dropped |

A runtime that can reach arbitrary outbound destinations is a liability. Outbound is allowlisted, not open.

---

## Logging

- Structured JSON logs, correlated by `instructionId`.
- Every instruction received, every signature check, every rejection, every result — logged.
- Logs shipped to an HQ-visible store (so the CEO sees runtime activity without SSH).
- No secrets, no full payloads with sensitive data — redact before log.

---

## Health Check

Per the ratified contract:
- `runtime-gateway` exposes `GET /runtime/health` → `{ status, runtimeId, version, activeInstructions, uptime }`.
- Runtime POSTs heartbeat to HQ every **30s**.
- HQ marks **stale at 90s**, **offline at 180s**.
- A stale/offline runtime receives **no new instructions**.

A future `/hq/runtime` page would surface this status (separate UI PR).

---

## Deployment Phases

Each phase is its own gated PR. No phase skips the 4-validation gate.

| Phase | What | Live executor |
|---|---|---|
| **0 — This plan** | Readiness doc ratified | 🔴 locked |
| **1 — Local prototype** | Runtime gateway + agent run locally, dry-run echo only | 🔴 locked |
| **2 — Canary echo** | Deploy `runtime.health.echo` to VPS; HQ dispatches signed echo, validates round-trip | 🔴 locked |
| **3 — First read-only skill** | `opportunity.scan` (read-only) executes in runtime, dry-run | 🔴 locked |
| **4 — Persistence wired** | Mission + approval persistence on Supabase; idempotency atomic | 🔴 locked |
| **5 — Red Team pass** | Hermes Auditor `redteam.pass` on the full live path | 🔴 locked |
| **6 — Live unlock** | Explicit CEO mandate flips first skill to live | 🟢 conditional, per-skill |

**The live executor stays locked through Phases 0–5.** Phase 6 is a dedicated PR after the Red Team pass, and unlocks one canary skill at a time — never the whole catalog at once.

---

## What This Plan Does NOT Do

- Provision a VPS
- Write Dockerfiles or compose files
- Write any runtime code
- Issue any secret or token
- Unlock the live executor
- Change anything in the HQ codebase

It is a checklist and a sequence, ratified before money is spent or risk is taken.

---

## Open Questions for CEO Sign-Off

1. **VPS provider** — Hetzner (cheapest), DigitalOcean (simplest), or OVH (CA region)?
2. **Domain** — which base domain hosts `runtime.<domain>`?
3. **Log retention** — how long should runtime logs be kept (7d / 30d / 90d)?
4. **Phase 1 timing** — start the local prototype now, or finish persistence (Phase 4 prerequisites) first?

---

## Next Step

After CEO sign-off:
**PR #37 — Runtime Local Prototype (Phase 1)** — the first PR that introduces actual runtime code, running locally only, dry-run echo only, no VPS. Still gated, still no live executor.

---

## Reference Docs

- `docs/ORIA_RUNTIME_CONTRACT.md` — the contract this plan implements
- `docs/ORIA_HQ_PHASE2_SNAPSHOT.md` — system state
- `docs/MISSION_CONTROL_OPERATING_MANUAL.md` — gate sequence
- `docs/ORIA_AGENT_OPERATING_MANUAL.md` — agent/skill roles
