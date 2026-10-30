import "server-only";
import { randomUUID } from "node:crypto";
import { guardGovernedAction } from "@/server/runtime/execution-guard";
import { createOwnerSpecStore, type OwnerSpecStore } from "./atelier-owner-spec-store";
import { OWNER_SPEC_KEY, OWNER_SPEC_OPERATION, ownerSpecRequestSchema, ownerSpecContextSchema, buildOwnerSpecPayload,
  readOwnerSpecReview, ownerSpecAdmissionSchema, ownerSpecAdmissionMatches, validateOwnerSpecResult,
  ownerSpecIntentId, sha256, type OwnerSpecContext, type OwnerSpecPayload, type OwnerSpecExecution } from "./atelier-owner-spec-contract";

export type OwnerSpecHost = { installationId: string; qualify(payload: OwnerSpecPayload): Promise<boolean> };
export type OwnerSpecEngine = { execute(execution: OwnerSpecExecution): Promise<unknown>; recover?(execution: OwnerSpecExecution): unknown | Promise<unknown> };
export type OwnerSpecServiceDeps = { store?: OwnerSpecStore; host?: OwnerSpecHost | null; engine?: OwnerSpecEngine | null;
  now?: () => number; uuid?: () => string };

/** Complete owner-operated candidate, deliberately unmounted. No real provider by default.
 * Recovery never launches. The only dispatch is a fresh ACK of the atomic G1 admission,
 * followed by a current DB check and the engine's exclusive attempt marker.
 * Revocation after the current check cannot retract a process already started; no exactly-once claim.
 */
export function createOwnerSpecService(deps: OwnerSpecServiceDeps = {}) {
  const store = deps.store ?? createOwnerSpecStore();
  const host = deps.host ?? null, engine = deps.engine ?? null;
  const now = deps.now ?? Date.now, uuid = deps.uuid ?? randomUUID;
  return { async command(raw: unknown, context: OwnerSpecContext) {
    const req = ownerSpecRequestSchema.safeParse(raw), ctx = ownerSpecContextSchema.safeParse(context);
    if (!req.success || !ctx.success) return { status: "invalid_request" } as const;
    try {
      const m = await store.load(ctx.data, req.data.missionId);
      if (!m) return { status: "not_found" } as const;
      const state = m.input[OWNER_SPEC_KEY] as { review?: unknown; admission?: unknown; result?: unknown } | undefined;
      const existing = readOwnerSpecReview(state?.review);
      if (req.data.command === "recover") {
        if (!existing) return { status: "not_found" } as const;
        const p = existing.payload;
        if (p.workspaceId !== ctx.data.workspaceId || p.modeId !== ctx.data.modeId || p.actorId !== ctx.data.actorId
          || p.missionId !== m.id || p.runId !== req.data.runId) return { status: "not_found" } as const;
        if (!state?.admission) return { status: "reviewed", review: existing.review } as const;
        const receipt = ownerSpecAdmissionSchema.safeParse(state.admission);
        if (!receipt.success || !ownerSpecAdmissionMatches(receipt.data, p, existing.review.payloadHash)) return { status: "reconciliation_required" } as const;
        const execution = { payload: p, payloadHash: existing.review.payloadHash, receipt: receipt.data };
        if (state.result === undefined) {
          // Explicit evidence-only reconciliation: never spawn or approve another step.
          // Revocation blocks execution, not recording an already observed historical fact.
          const local = engine?.recover ? validateOwnerSpecResult(await engine.recover(execution), execution) : null;
          if (!local || local.status !== "succeeded") return { status: "reconciliation_required", receipt: receipt.data } as const;
          const recorded = await store.record(execution, local);
          return recorded.status === "recorded" || recorded.status === "existing"
            ? { status: "recovered", receipt: receipt.data, result: local } as const
            : { status: "reconciliation_required", receipt: receipt.data } as const;
        }
        const result = validateOwnerSpecResult(state.result, execution);
        return result ? { status: "recovered", receipt: receipt.data, result } as const : { status: "reconciliation_required" } as const;
      }
      if (state?.admission) return { status: "reconciliation_required" } as const;
      if (!host || !engine) return { status: "unavailable" } as const;
      const p = req.data.command === "review"
        ? buildOwnerSpecPayload(m, ctx.data, { runId: req.data.runId, installationId: host.installationId,
          reviewId: uuid(), reviewExpiresAt: new Date(now() + 5 * 60_000).toISOString() })
        : existing ? buildOwnerSpecPayload(m, ctx.data, { runId: req.data.runId, installationId: host.installationId,
          reviewId: existing.payload.reviewId, reviewExpiresAt: existing.payload.reviewExpiresAt }) : null;
      if (!p) return { status: "conflict" } as const;
      const payloadHash = sha256(JSON.stringify(p));
      if (req.data.command === "confirm" && (!existing || payloadHash !== existing.review.payloadHash
        || payloadHash !== req.data.expectedReviewHash)) return { status: "conflict" } as const;
      if (new Date(p.reviewExpiresAt).getTime() <= now()) return { status: "approval_required" } as const;
      // Recognition is not approval. Unknown actions/hard BLOCK are never made approvable.
      const advisory = guardGovernedAction({ agentId: "owner-operated-atelier", action: OWNER_SPEC_OPERATION, payloadHash }, () => {
        throw new Error("advisory_must_not_execute");
      });
      if (advisory.verdict !== "REQUIRE_APPROVAL") return { status: "blocked" } as const;
      if (!await host.qualify(p)) return { status: "unavailable" } as const;
      if (req.data.command === "review") return store.review(m, ctx.data, p);
      const admitted = await store.admit(p, payloadHash);
      if (admitted.status !== "admitted") return admitted.status === "existing" ? { status: "reconciliation_required", receipt: admitted.receipt } as const : admitted;
      const receipt = ownerSpecAdmissionSchema.safeParse(admitted.receipt);
      if (!receipt.success || !ownerSpecAdmissionMatches(receipt.data, p, payloadHash)) return { status: "reconciliation_required" } as const;
      const execution = { payload: p, payloadHash, receipt: receipt.data };
      if (!await store.current(execution)) return { status: "reconciliation_required", receipt: receipt.data } as const;
      // IDs come solely from the consumed, validated, freshly acknowledged DB admission.
      const dispatch = guardGovernedAction({ agentId: "owner-operated-atelier", action: OWNER_SPEC_OPERATION, payloadHash,
        approvedDecision: { status: "approved", action: OWNER_SPEC_OPERATION, payloadHash,
          decisionId: receipt.data.decisionId, intentId: ownerSpecIntentId(p) } }, () => engine.execute(execution));
      if (!dispatch.allowed) return { status: "blocked" } as const;
      const result = validateOwnerSpecResult(await dispatch.result, execution);
      if (!result) return { status: "reconciliation_required", receipt: receipt.data } as const;
      const recorded = await store.record(execution, result);
      if (recorded.status !== "recorded" && recorded.status !== "existing") return { status: "reconciliation_required", receipt: receipt.data } as const;
      return { status: "recorded", receipt: receipt.data, result } as const;
    } catch { return { status: "reconciliation_required" } as const; }
  } };
}
