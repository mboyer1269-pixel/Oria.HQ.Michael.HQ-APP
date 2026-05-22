# Local Runtime Prototype

Status: **LOCAL PROTOTYPE** — no VPS, no Docker, no live executor, no external I/O.  
Date: 2026-05-22  
File: `src/server/runtime/local-runtime.ts`

---

## What This Is

The first concrete implementation of the HQ ↔ Runtime contract, running **entirely in-process and local**. It validates the signed-instruction round-trip with one ultra-safe canary skill: `runtime.health.echo`.

It implements `docs/ORIA_RUNTIME_CONTRACT.md` and the ratified decisions in `docs/ORIA_VPS_RUNTIME_READINESS.md` — at prototype fidelity.

**No VPS. No Docker. No network. No DB. No secrets. No Joris wiring. No API route. No `ledger.record()`. No live execution.**

---

## Files

| File | Purpose |
|---|---|
| `src/server/runtime/local-runtime.ts` | Types + pure functions: build, sign, verify, run |
| `src/scripts/smoke/runtime-health-echo.mjs` | 13-check smoke test of the full round-trip |
| `package.json` | Adds `smoke:runtime` script |

---

## Types

| Type | Role |
|---|---|
| `LocalRuntimeInstruction` | Signed instruction (mission + agent + skill + approval + mode) |
| `LocalRuntimeResult` | Signed result (`completed` or `rejected`) with `ledgerMetadata` |
| `LocalRuntimeMode` | `"dry_run" \| "live"` |
| `LocalRuntimeRejectionReason` | `bad_signature \| expired_instruction \| live_mode_not_supported \| approval_confirmed_not_supported \| unsupported_skill` |

---

## Functions (all pure)

| Function | Behavior |
|---|---|
| `buildMockLocalRuntimeInstruction(input?)` | Builds and signs an instruction. Defaults: `mode: "dry_run"`, `approvalConfirmed: false`, 120s TTL, skill `runtime.health.echo`. |
| `verifyMockLocalRuntimeInstruction(instruction)` | Recomputes the HMAC over the canonicalized payload and compares with a timing-safe check. |
| `verifyMockLocalRuntimeResult(result)` | Same verification for a result envelope. |
| `runLocalRuntimeInstruction(instruction, options?)` | Runs the gate sequence and returns a signed result. Echo only — no side effects. |

### Signing

- **HMAC-SHA256** (`node:crypto`), matching the ratified contract decision.
- Payload is **canonicalized** before signing: object keys sorted recursively, `undefined` dropped — so signature is stable regardless of key order.
- Signature format: `mock-local:v1:<hex digest>`.
- Comparison uses `timingSafeEqual` to avoid timing leaks.
- The signing key is a **mock local constant** explicitly marked not-a-secret. A real runtime injects the key at deploy time (never committed) — see the readiness plan.

---

## Canary Skill: `runtime.health.echo`

| Field | Value |
|---|---|
| Input | `{ message: string, ... }` (arbitrary echo payload) |
| Output | `{ skillId, echo: <inputPayload>, mode: "dry_run", sideEffects: [] }` |
| Side effects | none — `sideEffects` is always `[]` |
| Output constraint | "Echo only. No external calls, writes, sends, spends, or live execution." |

This is deliberately the lowest-blast-radius skill — it proves the contract plumbing without touching any real capability (`mission.plan`, `calendar.book` are *not* the canary).

---

## Gate Sequence in `runLocalRuntimeInstruction`

Rejections are returned as a signed result with `outcome: "rejected"`, in this order:

1. **Bad signature** → `bad_signature` (instruction was tampered with)
2. **Expired** (`expiresAt <= now`) → `expired_instruction`
3. **Live mode** (`mode === "live"`) → `live_mode_not_supported`
4. **Approval confirmed** (`approvalConfirmed === true`) → `approval_confirmed_not_supported`
5. **Wrong skill** (not `runtime.health.echo`) → `unsupported_skill`

Only a dry-run, signed, unexpired, unconfirmed `runtime.health.echo` instruction completes.

**Note:** the prototype actively rejects `approvalConfirmed: true` and `mode: "live"`. The prototype cannot be coaxed into a live execution path even by a forged-looking flag.

---

## Smoke Test

`npm run smoke:runtime` exercises the full round-trip (uses `jiti` to import the TS module). 13 checks:

- skill id, dry-run mode, `approvalConfirmed: false`
- signed instruction completes; echo preserves `message` + `correlationId`; zero side effects
- result signature verifies
- tampered instruction → `bad_signature`
- live mode → `live_mode_not_supported`
- expired → `expired_instruction`
- unsupported skill (`calendar.book`) → `unsupported_skill`

All 13 pass at commit time.

---

## What This Does NOT Do

- No VPS, no Docker, no network calls, no DB
- No real secret — mock signing key only
- No Joris wiring, no API route, no `ledger.record()`
- No live executor — `mode: "live"` is always rejected
- Nothing leaves the process

---

## Next Step (per the 7-phase plan)

Phase 1 (this prototype) is **local only**. The next gated PR would be either:
- **Runtime Status UI** — a `/hq/runtime` page surfacing health/echo round-trip, or
- **Local Runtime Health Endpoint** — wrap `runLocalRuntimeInstruction` behind a local-only route

Live executor stays locked through Phase 5 regardless.

---

## Reference

- `docs/ORIA_RUNTIME_CONTRACT.md` — the contract this implements
- `docs/ORIA_VPS_RUNTIME_READINESS.md` — ratified decisions + 7-phase plan
- `src/server/runtime/local-runtime.ts` — the implementation
