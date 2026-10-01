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
//   - Never throws toward the caller.
//   - Individual fetchFns per provider so tests can inject mocks independently.
//
// No persistence. Monetary amount stays null: tokens are not dollars,
// and a failed request is not recorded as zero.

import "server-only";

import type { RoutingCostAssessment } from "@/core/types";
import { executionTargetForModel } from "@/server/ai/execution-models";
import { generateJsonWithAnthropic } from "./anthropic-json-client";
import { generateJsonWithOpenAI } from "./openai-json-client";

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
   * Aggregate. `unknown_cost` when an earlier attempt may have been billed or
   * returned no usage: the successful tokens are not the whole cost.
   * `monetaryUsd` stays null. This is not a persistent budget.
   */
  cost: RoutingCostAssessment;
};

export type LlmJsonProviderErrorCode =
  | "no_provider_available"
  | "all_providers_failed"
  | "model_unsupported";

export type LlmJsonProviderFailure = {
  ok: false;
  errorCode: LlmJsonProviderErrorCode;
  fallbackReason: string;
  failureChain: string[];
  providerUsed?: LlmProvider;
  chosenModelId?: string;
  executedModelId: null;
  attempts: LlmAttemptCost[];
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

export async function generateStructuredJson(
  input: LlmJsonProviderInput,
): Promise<LlmJsonProviderResult> {
  if (input.modelId) {
    const target = executionTargetForModel(input.modelId);
    if (!target.callable) {
      return {
        ok: false,
        errorCode: "model_unsupported",
        fallbackReason: target.reason,
        failureChain: [],
        chosenModelId: input.modelId,
        executedModelId: null,
        attempts: [],
        cost: refused(),
      };
    }
  }

  const order = resolveOrder(input);
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
        cost: refused(),
      };
    }
    attemptCount++;
    const isFirstAttempt = attemptCount === 1;

    let result:
      | Awaited<ReturnType<typeof generateJsonWithAnthropic>>
      | Awaited<ReturnType<typeof generateJsonWithOpenAI>>;

    try {
      if (provider === "anthropic") {
        result = await generateJsonWithAnthropic(
          {
            systemPrompt: input.systemPrompt,
            userPrompt: input.userPrompt,
            maxTokens: input.maxTokens,
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
            maxTokens: input.maxTokens,
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
    cost: aggregateCost(attempts),
  };
}
