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
  type CallAccessClass,
  type CallReservationGate,
  type CallReservationSnapshot,
} from "@/server/ai/call-reservation";
import { executionTargetForModel } from "@/server/ai/execution-models";
import {
  assessServerEmission,
  type ApprovedServerBinding,
  type ServerCapability,
  type ServerCapabilityCatalog,
  type ServerEmissionAssessment,
  type ServerEmissionBlock,
} from "@/server/ai/server-capability-catalog";
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
  /**
   * Server-verified capabilities. When present, a model is not sent unless
   * this workspace's entry is authorized, tooled as required, and tariffed.
   * Absent: the four static API ids keep the existing path. Not a browser body.
   */
  serverCatalog?: ServerCapabilityCatalog;
  /** When true, an entry with tools false is not sent. */
  requiresTools?: boolean;
  /** Clock for tariff age. Defaults to Date.now(). */
  nowMs?: number;
  /**
   * Set only by generateHqStructuredJson. Legacy callers leave this unset.
   * An unset catalog is not a security proof.
   */
  requireServerCatalog?: boolean;
  /**
   * Required by generateHqStructuredJson. Compared to the catalog before
   * any reservation or fetch. Legacy callers leave it unset.
   */
  approved?: ApprovedServerBinding;
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
  /** Id the caller asked for. Null when the caller did not name one. */
  requestedModelId: string | null;
  /** Server account the strict decision named. Null when the call did not bind one. */
  accountId: string | null;
  chosenModelId?: string;
  /** Model id from the provider body. Null when the body does not say. Never the request id. */
  executedModelId: string | null;
  provider: LlmProvider | null;
  providerUsed: LlmProvider;
  usage: { input: number; output: number } | null;
  /** Consumption source. Estimation stays on chooseModel and is not this field. */
  costSource: CostSource;
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

export type CostSource = "provider_usage" | "refused" | "unknown" | "estimation";

export type LlmJsonProviderErrorCode =
  | "no_provider_available"
  | "all_providers_failed"
  | "model_unsupported"
  | "capability_blocked"
  | "non_api_authorized"
  | "reservation_blocked";

export type LlmJsonProviderFailure = {
  ok: false;
  errorCode: LlmJsonProviderErrorCode;
  fallbackReason: string;
  failureChain: string[];
  requestedModelId: string | null;
  /** Server account the strict decision named. Null when the call did not bind one. */
  accountId: string | null;
  providerUsed?: LlmProvider;
  provider: null;
  chosenModelId?: string;
  executedModelId: null;
  usage: null;
  costSource: CostSource;
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

function costSourceFrom(cost: RoutingCostAssessment): CostSource {
  if (cost.kind === "observed_usage") return "provider_usage";
  if (cost.kind === "refused") return "refused";
  if (cost.kind === "estimation") return "estimation";
  return "unknown";
}

function requestedModelIdOf(input: LlmJsonProviderInput): string | null {
  return typeof input.modelId === "string" && input.modelId.length > 0 ? input.modelId : null;
}

function observedFrom(result: { observedModelId?: string | null }): string | null {
  return typeof result.observedModelId === "string" && result.observedModelId.length > 0
    ? result.observedModelId
    : null;
}

function refusalAccessClass(
  block: string,
  modelId: string | undefined,
): CallAccessClass | undefined {
  if (block === "subscription") return "subscription";
  if (block === "verified_free") return "unknown";
  if (
    block === "binding_required"
    || block === "binding_mismatch"
    || block === "account_mismatch"
    || block === "account_ambiguous"
    || block === "catalog_required"
  ) {
    return undefined;
  }
  if (!modelId) return undefined;
  return accessClassForModel(modelId);
}

function boundAccountId(input: LlmJsonProviderInput): string | null {
  const id = input.approved?.accountId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function readStrictBinding(input: LlmJsonProviderInput): "binding_required" | "binding_mismatch" | null {
  if (!input.requireServerCatalog) return null;
  const approved = input.approved;
  const revision = input.serverCatalog?.revision;
  if (!approved || typeof revision !== "string" || revision.length === 0) return "binding_required";
  if (
    typeof approved.accountId !== "string" || approved.accountId.length === 0
    || typeof approved.workspaceId !== "string" || approved.workspaceId.length === 0
    || typeof approved.modelId !== "string" || approved.modelId.length === 0
    || typeof approved.catalogRevision !== "string" || approved.catalogRevision.length === 0
    || (approved.billingKind !== "api" && approved.billingKind !== "verified_free" && approved.billingKind !== "subscription")
  ) {
    return "binding_required";
  }
  if (
    approved.catalogRevision !== revision
    || approved.workspaceId !== input.workspaceId
    || approved.modelId !== input.modelId
  ) {
    return "binding_mismatch";
  }
  return null;
}

function entryMatchesBinding(entry: ServerCapability, approved: ApprovedServerBinding): boolean {
  return entry.accountId === approved.accountId
    && entry.workspaceId === approved.workspaceId
    && entry.modelId === approved.modelId
    && entry.billingKind === approved.billingKind;
}

function isNonApiRefusal(
  assessment: Extract<ServerEmissionAssessment, { emit: false }>,
): assessment is Extract<ServerEmissionAssessment, { disposition: "non_api" }> {
  return "disposition" in assessment && assessment.disposition === "non_api";
}

function capabilityBlocked(
  input: LlmJsonProviderInput,
  block: ServerEmissionBlock | "catalog_ceiling" | "verified_free" | "subscription",
  configured: boolean,
  errorCode: LlmJsonProviderErrorCode = "capability_blocked",
  accountId: string | null = null,
): LlmJsonProviderFailure {
  const accessClass = refusalAccessClass(block, input.modelId);
  const reservation: CallReservationSnapshot = configured
    ? {
        configured: true,
        status: "refused",
        currency: null,
        reservedCents: null,
        networkEmitted: false,
        reconciliationRequired: false,
        reason: block,
        ...(accessClass ? { accessClass } : {}),
      }
    : unavailableReservation();
  const cost = refused();
  return {
    ok: false,
    errorCode,
    fallbackReason: block,
    failureChain: [],
    requestedModelId: requestedModelIdOf(input),
    accountId,
    provider: null,
    ...(input.modelId ? { chosenModelId: input.modelId } : {}),
    executedModelId: null,
    usage: null,
    costSource: costSourceFrom(cost),
    attempts: [],
    reservation,
    cost,
  };
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
  let catalogCeilingCents: number | undefined;

  if (input.requireServerCatalog && (!input.serverCatalog || !input.modelId || !input.workspaceId)) {
    return capabilityBlocked(input, "catalog_required", configured, "capability_blocked", boundAccountId(input));
  }
  const bindingFault = readStrictBinding(input);
  if (bindingFault) {
    return capabilityBlocked(input, bindingFault, configured, "capability_blocked", boundAccountId(input));
  }

  if (input.serverCatalog && input.modelId) {
    const invoked = executionTargetForModel(input.modelId);
    const assessment = assessServerEmission({
      catalog: input.serverCatalog,
      modelId: input.modelId,
      workspaceId: input.workspaceId ?? "",
      requiresTools: input.requiresTools === true,
      nowMs: input.nowMs ?? Date.now(),
      ...(input.approved ? { accountId: input.approved.accountId } : {}),
      ...(invoked.callable ? { invokedProvider: invoked.provider } : {}),
    });
    if (!assessment.emit) {
      if (isNonApiRefusal(assessment)) {
        if (input.approved && !entryMatchesBinding(assessment.capability, input.approved)) {
          return capabilityBlocked(input, "binding_mismatch", configured, "capability_blocked", boundAccountId(input));
        }
        return capabilityBlocked(
          input,
          assessment.billingKind,
          configured,
          "non_api_authorized",
          assessment.capability.accountId,
        );
      }
      return capabilityBlocked(input, assessment.block, configured, "capability_blocked", boundAccountId(input));
    }
    const capabilityBilling = assessment.capability.billingKind;
    if (capabilityBilling !== "api") {
      return capabilityBlocked(
        input,
        capabilityBilling,
        configured,
        "non_api_authorized",
        assessment.capability.accountId,
      );
    }
    if (input.approved && !entryMatchesBinding(assessment.capability, input.approved)) {
      return capabilityBlocked(input, "binding_mismatch", configured, "capability_blocked", boundAccountId(input));
    }
    if (invoked.callable) {
      catalogCeilingCents = assessment.notToExceedCents;
      if (!configured) {
        return capabilityBlocked(input, "catalog_ceiling", configured, "capability_blocked", boundAccountId(input));
      }
    }
  }

  if (input.modelId) {
    const target = executionTargetForModel(input.modelId);
    if (!target.callable) {
      const cost = refused();
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
        requestedModelId: requestedModelIdOf(input),
        accountId: boundAccountId(input),
        provider: null,
        chosenModelId: input.modelId,
        executedModelId: null,
        usage: null,
        costSource: costSourceFrom(cost),
        attempts: [],
        reservation,
        cost,
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
      const cost = aggregateCost(attempts);
      return {
        ok: false,
        errorCode: "model_unsupported",
        fallbackReason: `${String(provider)} n'est pas un fournisseur pris en charge.`,
        failureChain,
        requestedModelId: requestedModelIdOf(input),
        accountId: boundAccountId(input),
        provider: null,
        ...(input.modelId ? { chosenModelId: input.modelId } : {}),
        executedModelId: null,
        usage: null,
        costSource: costSourceFrom(cost),
        attempts,
        reservation,
        cost,
      };
    }
    attemptCount++;
    const isFirstAttempt = attemptCount === 1;
    const modelId = input.modelId ?? defaultModelFor(provider);
    if (input.serverCatalog && !input.modelId) {
      const assessment = assessServerEmission({
        catalog: input.serverCatalog,
        modelId,
        workspaceId: input.workspaceId ?? "",
        requiresTools: input.requiresTools === true,
        nowMs: input.nowMs ?? Date.now(),
        invokedProvider: provider,
      });
      if (!assessment.emit) {
        if (isNonApiRefusal(assessment)) {
          if (attempts.length === 0) {
            return capabilityBlocked(
              input,
              assessment.billingKind,
              configured,
              "non_api_authorized",
              assessment.capability.accountId,
            );
          }
          break;
        }
        if (attempts.length === 0) return capabilityBlocked(input, assessment.block, configured);
        break;
      }
      if (assessment.billingKind !== "api") {
        break;
      }
      catalogCeilingCents = assessment.notToExceedCents;
      if (!configured) {
        if (attempts.length === 0) return capabilityBlocked(input, "catalog_ceiling", configured);
        break;
      }
    }
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
      ...(catalogCeilingCents !== undefined ? { catalogCeilingCents } : {}),
    });
    reservation = decision.reservation;
    if (!decision.emit) {
      const blocking =
        decision.reservation.reason === "identity" ||
        decision.reservation.reason === "store_unavailable" ||
        decision.reservation.reason === "access_class" ||
        decision.reservation.reason === "emit_right_held" ||
        decision.reservation.reason === "mark_unconfirmed" ||
        decision.reservation.reason === "catalog_ceiling" ||
        decision.reservation.status === "lost" ||
        decision.reservation.status === "unavailable";
      failureChain.push(`${provider}: reservation ${decision.reservation.reason ?? decision.reservation.status}`);
      attempts.push({ provider, cost: refused() });
      if (blocking) {
        const cost = aggregateCost(attempts);
        return {
          ok: false,
          errorCode: "reservation_blocked",
          fallbackReason: failureChain[failureChain.length - 1],
          failureChain,
          requestedModelId: requestedModelIdOf(input),
          accountId: boundAccountId(input),
          provider: null,
          ...(input.modelId ? { chosenModelId: input.modelId } : {}),
          executedModelId: null,
          usage: null,
          costSource: costSourceFrom(cost),
          attempts,
          reservation,
          cost,
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
      const cost = aggregateCost(attempts);
      const usage = result.tokenUsage ?? null;
      return {
        ok: true,
        json: result.json,
        rawText: result.rawText,
        modelId: result.modelId,
        requestedModelId: requestedModelIdOf(input),
        accountId: boundAccountId(input),
        ...(input.modelId ? { chosenModelId: input.modelId } : {}),
        executedModelId: observedFrom(result),
        provider,
        providerUsed: provider,
        usage,
        costSource: costSourceFrom(cost),
        fallbackUsed: !isFirstAttempt,
        failureChain,
        ...(usage ? { tokenUsage: usage } : {}),
        attempts,
        reservation,
        cost,
      };
    }

    failureChain.push(`${provider}: ${result.fallbackReason}`);
  }

  const cost = aggregateCost(attempts);
  return {
    ok: false,
    errorCode: order.length === 0 ? "no_provider_available" : "all_providers_failed",
    fallbackReason:
      failureChain.length > 0
        ? failureChain[failureChain.length - 1]
        : "No providers configured",
    failureChain,
    requestedModelId: requestedModelIdOf(input),
    accountId: boundAccountId(input),
    provider: null,
    ...(input.modelId ? { chosenModelId: input.modelId } : {}),
    executedModelId: null,
    usage: null,
    costSource: costSourceFrom(cost),
    attempts,
    reservation,
    cost,
  };
}

/**
 * Strict HQ entry. The caller supplies the approved server binding.
 * A missing catalog, workspace, model, or binding is refused before any
 * reservation or fetch. Subscription and verified free are not executed:
 * `emit: true` is only the metered API shape, and a non-API capability
 * still returns `non_api_authorized` with no socket.
 * `generateStructuredJson` without this flag is the legacy path. It is not a security proof.
 */
export async function generateHqStructuredJson(
  input: Omit<LlmJsonProviderInput, "requireServerCatalog" | "approved" | "serverCatalog" | "modelId" | "workspaceId"> & {
    approved: ApprovedServerBinding;
    serverCatalog: ServerCapabilityCatalog;
    modelId: string;
    workspaceId: string;
  },
): Promise<LlmJsonProviderResult> {
  return generateStructuredJson({ ...input, requireServerCatalog: true });
}
