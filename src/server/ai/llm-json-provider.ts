// src/server/ai/llm-json-provider.ts
//
// Provider abstraction over Anthropic and OpenAI JSON clients.
//
// Exposes a single entry point — generateStructuredJson — that handles
// provider preference, ordered fallback, and failure chain recording.
//
// Design:
//   - "auto" tries Anthropic only, unless paidFallback authorizes OpenAI
//     for the same workspaceId. There is no implicit second paid provider.
//   - "anthropic" / "openai" use that provider exclusively.
//   - A requested modelId is sent only to the provider that supports it.
//     An unsupported or unavailable id is refused before any fetch.
//   - failureChain records each failure reason for observability.
//   - Never throws toward the caller. A rejected reservation registry is
//     unavailable: no socket before a confirmed mark, and no second model
//     call after a completed response.
//   - Individual fetchFns per provider so tests can inject mocks independently.
//
// No observed price is copied onto the cost: tokens are not dollars, a
// routing weight is not a reserve, and a failed request is not zero.
// When HQ_CALL_RESERVATION=1, a separate USD-cent hold is taken from the
// server quote before the socket. That hold is not the cost assessment.

import "server-only";

import { randomUUID } from "node:crypto";

import type { RoutingCostAssessment } from "@/core/types";
import {
  accessClassForModel,
  authorizeCallAttempt,
  callReservationConfigured,
  createDurableCallReservationGate,
  requestInputBytes,
  unavailableReservation,
  type CallReservationGate,
  type CallReservationSnapshot,
} from "@/server/ai/call-reservation";
import { executionTargetForModel } from "@/server/ai/execution-models";
import { generateJsonWithAnthropic, ANTHROPIC_JSON_DEFAULT_MAX_TOKENS, ANTHROPIC_JSON_DEFAULT_MODEL } from "./anthropic-json-client";
import { generateJsonWithOpenAI, OPENAI_JSON_DEFAULT_MAX_TOKENS, OPENAI_JSON_DEFAULT_MODEL } from "./openai-json-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LlmProvider = "anthropic" | "openai";

/** Explicit permission to try a second paid provider. Scoped to one workspace. */
export type PaidFallbackAuthorization = {
  authorized: true;
  workspaceId: string;
};

export type LlmJsonProviderInput = {
  providerPreference: LlmProvider | "auto";
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** When set, only this id may be sent, and only to its supporting provider. */
  modelId?: string;
  /** Required to match paidFallback.workspaceId. Does not authorize by itself. */
  workspaceId?: string;
  /** Absent by default. A mismatching workspace does not authorize a second provider. */
  paidFallback?: PaidFallbackAuthorization;
  /**
   * Server identity of this call or mission. Not a price and not a ceiling.
   * Required only when HQ_CALL_RESERVATION=1. Never taken from a client budget field.
   */
  callSubjectId?: string;
  /** Test double. Production uses the durable SQL ledger. */
  reservationGate?: CallReservationGate;
  // Per-provider fetch overrides for test injection.
  fetchFns?: {
    anthropic?: typeof fetch;
    openai?: typeof fetch;
  };
};

/** One provider attempt. Monetary amount stays null on every entry. */
export type LlmAttemptCost = {
  provider: LlmProvider;
  cost: RoutingCostAssessment;
};

export type LlmJsonProviderSuccess = {
  ok: true;
  json: unknown;
  rawText: string;
  /** Id actually placed in the provider request. */
  modelId: string;
  chosenModelId?: string;
  executedModelId: string;
  providerUsed: LlmProvider;
  /** True only when an authorized second provider produced this success. */
  fallbackUsed: boolean;
  failureChain: string[];
  tokenUsage?: { input: number; output: number };
  /** Every attempt, including one that may have been billed before a later success. */
  attempts: LlmAttemptCost[];
  /**
   * Last reservation decision. USD cents come from a server quote when status
   * holds money. This is not a routing weight and not a provider invoice cap.
   */
  reservation: CallReservationSnapshot;
  /**
   * Aggregate. `unknown_cost` when an earlier attempt may have been billed or
   * returned no usage: the successful tokens are not the whole cost.
   * `monetaryUsd` stays null. This is not a persistent budget.
   */
  cost: RoutingCostAssessment;
};

export type LlmJsonProviderErrorCode =
  | "no_provider_available"
  | "all_providers_failed"
  | "model_unsupported"
  | "reservation_blocked";

export type LlmJsonProviderFailure = {
  ok: false;
  errorCode: LlmJsonProviderErrorCode;
  fallbackReason: string;
  failureChain: string[];
  providerUsed?: LlmProvider;
  chosenModelId?: string;
  executedModelId: null;
  attempts: LlmAttemptCost[];
  reservation: CallReservationSnapshot;
  cost: RoutingCostAssessment;
};

export type LlmJsonProviderResult = LlmJsonProviderSuccess | LlmJsonProviderFailure;

// ---------------------------------------------------------------------------
// Provider order resolution
// ---------------------------------------------------------------------------

function paidFallbackAuthorized(input: LlmJsonProviderInput): boolean {
  const auth = input.paidFallback;
  if (!auth || auth.authorized !== true) return false;
  if (!input.workspaceId || auth.workspaceId !== input.workspaceId) return false;
  return true;
}

function resolveOrder(input: LlmJsonProviderInput): LlmProvider[] {
  if (input.modelId) {
    const target = executionTargetForModel(input.modelId);
    return target.callable ? [target.provider] : [];
  }
  if (input.providerPreference === "anthropic") return ["anthropic"];
  if (input.providerPreference === "openai") return ["openai"];
  // "auto" does not climb to a second paid provider unless this workspace opted in.
  return paidFallbackAuthorized(input) ? ["anthropic", "openai"] : ["anthropic"];
}

function refused(): RoutingCostAssessment {
  return { kind: "refused", monetaryUsd: null, networkRequestSent: false };
}

/**
 * Global cost across attempts. Does not add dollars and does not drop an
 * earlier attempt. A later observed usage does not erase a request that may
 * already have been billed; that aggregate stays unknown.
 */
function aggregateCost(attempts: LlmAttemptCost[]): RoutingCostAssessment {
  if (attempts.length === 0 || attempts.every((attempt) => attempt.cost.kind === "refused")) {
    return refused();
  }
  const last = attempts[attempts.length - 1].cost;
  const priorMaybeBilled = attempts
    .slice(0, -1)
    .some((attempt) => attempt.cost.kind === "failed_maybe_billed");
  const lastSucceeded = last.kind === "observed_usage" || last.kind === "unknown_cost";
  if (lastSucceeded && priorMaybeBilled) {
    return { kind: "unknown_cost", monetaryUsd: null, networkRequestSent: true };
  }
  const anyMaybeBilled = attempts.some((attempt) => attempt.cost.kind === "failed_maybe_billed");
  if (!lastSucceeded && anyMaybeBilled) {
    return { kind: "failed_maybe_billed", monetaryUsd: null, networkRequestSent: true };
  }
  if (last.kind === "observed_usage") {
    return {
      kind: "observed_usage",
      monetaryUsd: null,
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      networkRequestSent: true,
    };
  }
  return {
    kind: last.kind,
    monetaryUsd: null,
    networkRequestSent: last.networkRequestSent,
    ...(last.inputTokens !== undefined ? { inputTokens: last.inputTokens } : {}),
    ...(last.outputTokens !== undefined ? { outputTokens: last.outputTokens } : {}),
  };
}

function costFromClient(result: {
  ok: boolean;
  errorCode?: string;
  tokenUsage?: { input: number; output: number };
}): RoutingCostAssessment {
  if (!result.ok) {
    if (result.errorCode === "no_api_key") {
      return { kind: "refused", monetaryUsd: null, networkRequestSent: false };
    }
    return { kind: "failed_maybe_billed", monetaryUsd: null, networkRequestSent: true };
  }
  if (result.tokenUsage) {
    return {
      kind: "observed_usage",
      monetaryUsd: null,
      inputTokens: result.tokenUsage.input,
      outputTokens: result.tokenUsage.output,
      networkRequestSent: true,
    };
  }
  return { kind: "unknown_cost", monetaryUsd: null, networkRequestSent: true };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

async function settleConsume(
  gate: CallReservationGate,
  identity: Parameters<CallReservationGate["consume"]>[0],
  known: CallReservationSnapshot,
): Promise<CallReservationSnapshot> {
  try {
    const consumed = await gate.consume(identity);
    if (
      consumed.status === "consumed"
      && consumed.currency === "USD"
      && consumed.reservedCents === known.reservedCents
      && consumed.reservedCents !== null
      && consumed.reconciliationRequired === false
    ) {
      return { ...consumed, configured: true };
    }
  } catch {
    // The model result is already in hand. Keep the reserved cents unknown.
  }
  return {
    ...known,
    configured: true,
    status: "emitted_unknown",
    currency: known.currency,
    reservedCents: known.reservedCents,
    networkEmitted: true,
    reconciliationRequired: true,
    reason: "consume_unconfirmed",
  };
}

function providerHasApiKey(provider: LlmProvider): boolean {
  return provider === "anthropic"
    ? Boolean(process.env.ANTHROPIC_API_KEY)
    : Boolean(process.env.OPENAI_API_KEY);
}

function defaultModelFor(provider: LlmProvider): string {
  return provider === "anthropic" ? ANTHROPIC_JSON_DEFAULT_MODEL : OPENAI_JSON_DEFAULT_MODEL;
}

function maxTokensFor(provider: LlmProvider, requested: number | undefined): number {
  if (requested !== undefined) return requested;
  return provider === "anthropic" ? ANTHROPIC_JSON_DEFAULT_MAX_TOKENS : OPENAI_JSON_DEFAULT_MAX_TOKENS;
}

export async function generateStructuredJson(
  input: LlmJsonProviderInput,
): Promise<LlmJsonProviderResult> {
  const configured = callReservationConfigured();
  const gate = configured ? (input.reservationGate ?? createDurableCallReservationGate()) : null;
  const callerId = randomUUID();
  let reservation: CallReservationSnapshot = unavailableReservation();

  if (input.modelId) {
    const target = executionTargetForModel(input.modelId);
    if (!target.callable) {
      if (configured) {
        reservation = {
          configured: true,
          status: "refused",
          currency: null,
          reservedCents: null,
          accessClass: accessClassForModel(input.modelId),
          networkEmitted: false,
          reconciliationRequired: false,
          reason: "access_class",
        };
      }
      return {
        ok: false,
        errorCode: "model_unsupported",
        fallbackReason: target.reason,
        failureChain: [],
        chosenModelId: input.modelId,
        executedModelId: null,
        attempts: [],
        reservation,
        cost: refused(),
      };
    }
  }

  const order = resolveOrder(input);
  const inputBytes = requestInputBytes(input.systemPrompt, input.userPrompt);
  const failureChain: string[] = [];
  const attempts: LlmAttemptCost[] = [];
  let attemptCount = 0;

  for (const provider of order) {
    if (provider !== "anthropic" && provider !== "openai") {
      return {
        ok: false,
        errorCode: "model_unsupported",
        fallbackReason: `${String(provider)} n'est pas un fournisseur pris en charge.`,
        failureChain,
        ...(input.modelId ? { chosenModelId: input.modelId } : {}),
        executedModelId: null,
        attempts,
        reservation,
        cost: aggregateCost(attempts),
      };
    }
    attemptCount++;
    const isFirstAttempt = attemptCount === 1;
    const modelId = input.modelId ?? defaultModelFor(provider);
    const maxTokens = maxTokensFor(provider, input.maxTokens);
    const decision = await authorizeCallAttempt({
      configured,
      gate,
      workspaceId: input.workspaceId,
      callSubjectId: input.callSubjectId,
      callerId,
      provider,
      modelId,
      maxTokens,
      inputBytes,
      hasApiKey: providerHasApiKey(provider),
    });
    reservation = decision.reservation;
    if (!decision.emit) {
      const blocking =
        decision.reservation.reason === "identity" ||
        decision.reservation.reason === "store_unavailable" ||
        decision.reservation.reason === "access_class" ||
        decision.reservation.reason === "emit_right_held" ||
        decision.reservation.reason === "mark_unconfirmed" ||
        decision.reservation.status === "lost" ||
        decision.reservation.status === "unavailable";
      failureChain.push(`${provider}: reservation ${decision.reservation.reason ?? decision.reservation.status}`);
      attempts.push({ provider, cost: refused() });
      if (blocking) {
        return {
          ok: false,
          errorCode: "reservation_blocked",
          fallbackReason: failureChain[failureChain.length - 1],
          failureChain,
          ...(input.modelId ? { chosenModelId: input.modelId } : {}),
          executedModelId: null,
          attempts,
          reservation,
          cost: aggregateCost(attempts),
        };
      }
      continue;
    }

    let result:
      | Awaited<ReturnType<typeof generateJsonWithAnthropic>>
      | Awaited<ReturnType<typeof generateJsonWithOpenAI>>;

    try {
      if (provider === "anthropic") {
        result = await generateJsonWithAnthropic(
          {
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxTokens,
            temperature: input.temperature,
            timeoutMs: input.timeoutMs,
            ...(input.modelId ? { modelId: input.modelId } : {}),
          },
          input.fetchFns?.anthropic,
        );
      } else {
        result = await generateJsonWithOpenAI(
          {
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxTokens,
            temperature: input.temperature,
            timeoutMs: input.timeoutMs,
            ...(input.modelId ? { modelId: input.modelId } : {}),
          },
          input.fetchFns?.openai,
        );
      }
    } catch {
      const reason = `${provider}: unexpected exception`;
      failureChain.push(reason);
      attempts.push({
        provider,
        cost: { kind: "failed_maybe_billed", monetaryUsd: null, networkRequestSent: true },
      });
      continue;
    }

    if (configured && gate && decision.reservation.status === "emitted_unknown" && result.ok) {
      reservation = await settleConsume(gate, decision.identity, decision.reservation);
    }

    const attemptCost = costFromClient(result);
    attempts.push({ provider, cost: attemptCost });

    if (result.ok) {
      return {
        ok: true,
        json: result.json,
        rawText: result.rawText,
        modelId: result.modelId,
        ...(input.modelId ? { chosenModelId: input.modelId } : {}),
        executedModelId: result.modelId,
        providerUsed: provider,
        fallbackUsed: !isFirstAttempt,
        failureChain,
        tokenUsage: result.tokenUsage,
        attempts,
        reservation,
        cost: aggregateCost(attempts),
      };
    }

    failureChain.push(`${provider}: ${result.fallbackReason}`);
  }

  return {
    ok: false,
    errorCode: order.length === 0 ? "no_provider_available" : "all_providers_failed",
    fallbackReason:
      failureChain.length > 0
        ? failureChain[failureChain.length - 1]
        : "No providers configured",
    failureChain,
    ...(input.modelId ? { chosenModelId: input.modelId } : {}),
    executedModelId: null,
    attempts,
    reservation,
    cost: aggregateCost(attempts),
  };
}
