// src/server/missions/openhands-model-execution-receipt.ts
//
// Model execution receipt — the minimal DTO connecting a model-selection
// decision (what was REQUESTED, from model-selection-policy.ts) to what an
// OpenHands launch actually used (what was OBSERVED). This module calls no
// provider, launches nothing, and is not a second router or a second launch
// authority: it only records the gap between request and observation so
// neither is ever confused for the other.
//
// Doctrine carried over from model-selection-policy.ts, provider-connection-
// discovery.ts, and the Hermes contract review (docs/CLAUDE-HERMES-CONTRAT-
// MODELES-V2-2026-10-01.md in the Orchestrator repo):
//   - requestedModelId and executedModelId are DIFFERENT fields, filled from
//     DIFFERENT inputs. buildModelExecutionReceipt() only ever reads
//     executedModelId off the `observed` argument — never off `decision`.
//     There is no code path that can default one from the other.
//   - Usage absent means UNKNOWN, never zero. Every usage field is
//     `number | null`; a missing observation is `null`, not `0`.
//   - Cost has two independent fields: `estimatedUsd` (known before launch,
//     from the caller's own budget/catalog arithmetic) and `observedUsd`
//     (known only after the runtime reports it, if it ever does). Neither
//     backfills the other.
//   - A receipt is addressed by the same `launchId` as the OpenHands launch
//     claim (openhands-launch.ts). Calling this twice with the same
//     `launchId` and the same `observed` input is a pure no-op — same
//     output both times, never a second receipt or a mutated one.

import type { ModelSelectionDecision } from "../agents/models/model-selection-policy";

export type EligibleModelSelectionDecision = Extract<ModelSelectionDecision, { eligible: true }>;

export type ObservedModelExecution = {
  /** Must match the launchId this observation is being attached to. */
  launchId: string;
  /** What the runtime actually reports running. null = not reported, i.e. unknown. */
  executedModelId: string | null;
  executedProviderId: string | null;
  /** Token/iteration counts actually observed. Absent fields are unknown, never 0. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    iterations?: number;
  };
  /** Cost actually billed/observed, in USD. Absent means unknown, never 0. */
  observedCostUsd?: number;
  observedAtIso: string;
};

export type ModelExecutionReceipt = {
  launchId: string;
  requestedModelId: string;
  requestedProviderId: string;
  requestedRuntimeAdapterId: string;
  executedModelId: string | null;
  executedProviderId: string | null;
  /** null until executedModelId is known — never guessed true/false in the meantime. */
  modelMatchesRequest: boolean | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    iterations: number | null;
  };
  cost: {
    estimatedUsd: number | null;
    observedUsd: number | null;
  };
  observedAtIso: string | null;
};

export type BuildModelExecutionReceiptResult =
  | { status: "ok"; receipt: ModelExecutionReceipt }
  | { status: "launch_id_mismatch" };

/**
 * Builds a receipt from a model-selection decision plus (optionally) what
 * was actually observed. With no `observed` argument, every observed-side
 * field is honestly null/unknown — a requested-but-not-yet-run receipt is a
 * legitimate, representable state, not an error.
 */
export function buildModelExecutionReceipt(
  decision: EligibleModelSelectionDecision,
  launchId: string,
  estimatedCostUsd: number | null,
  observed?: ObservedModelExecution,
): BuildModelExecutionReceiptResult {
  if (observed && observed.launchId !== launchId) {
    return { status: "launch_id_mismatch" };
  }

  const executedModelId = observed?.executedModelId ?? null;

  return {
    status: "ok",
    receipt: {
      launchId,
      requestedModelId: decision.modelId,
      requestedProviderId: decision.providerId,
      requestedRuntimeAdapterId: decision.runtimeAdapterId,
      executedModelId,
      executedProviderId: observed?.executedProviderId ?? null,
      modelMatchesRequest: executedModelId === null ? null : executedModelId === decision.modelId,
      usage: {
        promptTokens: observed?.usage?.promptTokens ?? null,
        completionTokens: observed?.usage?.completionTokens ?? null,
        iterations: observed?.usage?.iterations ?? null,
      },
      cost: {
        estimatedUsd: estimatedCostUsd,
        observedUsd: observed?.observedCostUsd ?? null,
      },
      observedAtIso: observed?.observedAtIso ?? null,
    },
  };
}

/**
 * Pure equality check for the "replay is a no-op" guarantee: same launchId
 * and same observed input must produce a deep-equal receipt. Callers that
 * persist receipts should use this (or an equivalent deep-equal) to detect a
 * true no-op replay versus a changed observation under the same launchId,
 * which is a conflict, never a silent overwrite.
 */
export function modelExecutionReceiptsEqual(
  a: ModelExecutionReceipt,
  b: ModelExecutionReceipt,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
