// src/server/agents/models/model-selection-policy.ts
//
// Model Selection Policy — the pure decision function of the chain:
//   Intent -> Agent Profile -> Model Policy -> Provider Registry
//     -> Runtime Adapter -> Sentinelle -> Ledger
//
// Given a validated AgentModelProfile, a route, and a registry, walk the
// route's candidates in order and return the first eligible one — with the
// runtime adapter to use and the Sentinelle gate metadata attached.
//
// Non-negotiables baked into the decision type:
//   - sentinelleRequired and ledgerRequired are literal `true` on every
//     eligible decision. No provider takes the wheel; every runtime decision
//     is gated and ledgered.
//   - Unknown model or unknown provider is INELIGIBLE, never a fallback.
//   - Tool use requires trust: "untrusted" providers cannot run tools at
//     all; "reviewed" providers run tools only behind a forced approval gate.
//   - Free-tier requests only match catalog-proven free pricing unless the
//     caller explicitly opts into trial/unknown.
//   - A preferred local runtime is used when its adapter exists, and silently
//     falls back when it does not — preferred, never assumed available.
//
// Pure function: no I/O, no process.env, no network, no clock.

import {
  isEligibleAsFree,
  type SentinelleGateMetadata,
} from "./model-provider-contract";
import {
  validateAgentModelProfile,
  type AgentModelProfile,
} from "./agent-model-profile-contract";
import type { ProviderRegistry } from "./provider-registry-contract";

// ---------------------------------------------------------------------------
// Request & decision types
// ---------------------------------------------------------------------------

export type ModelSelectionRequest = {
  profile: AgentModelProfile;
  /** Route name inside the profile, e.g. "conversation". */
  route: string;
  /** The intent needs tool execution (raises the trust bar). */
  requireToolUse?: boolean;
  /** The intent must run on a free-tier model (in addition to the route flag). */
  requireFreeTier?: boolean;
  /** Explicit policy opt-in: treat trial/unknown pricing as free. */
  allowTrialOrUnknownAsFree?: boolean;
  /** Model ids currently marked unavailable (outage, quota, kill switch). */
  unavailableModelIds?: readonly string[];
};

export type IneligibleReasonCode =
  | "invalid_profile"
  | "unknown_route"
  | "unknown_model"
  | "unknown_provider"
  | "model_unavailable"
  | "model_lacks_tool_use"
  | "provider_untrusted_for_tool_use"
  | "not_proven_free"
  | "no_runtime_adapter"
  | "no_eligible_candidate";

export type SkippedCandidate = {
  modelId: string;
  reasonCode: IneligibleReasonCode;
  reason: string;
};

export type ModelSelectionDecision =
  | {
      eligible: true;
      modelId: string;
      providerId: string;
      runtimeAdapterId: string;
      /** Gate metadata handed to Sentinelle — input, never a bypass. */
      sentinelle: SentinelleGateMetadata;
      sentinelleRequired: true;
      ledgerRequired: true;
      /** True when the route is an explicit, justified vendor pin. */
      pinned: boolean;
      reason: string;
      skipped: readonly SkippedCandidate[];
    }
  | {
      eligible: false;
      reasonCode: IneligibleReasonCode;
      reason: string;
      skipped: readonly SkippedCandidate[];
    };

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export function selectModel(
  registry: ProviderRegistry,
  request: ModelSelectionRequest,
): ModelSelectionDecision {
  const profileValidation = validateAgentModelProfile(request.profile);
  if (!profileValidation.ok) {
    return {
      eligible: false,
      reasonCode: "invalid_profile",
      reason: `agent model profile is invalid: ${profileValidation.errors.join("; ")}`,
      skipped: [],
    };
  }

  // Own-property lookup only: a route name like "toString" must miss, never
  // resolve through the prototype chain of the routes record.
  const binding = Object.hasOwn(request.profile.routes, request.route)
    ? request.profile.routes[request.route]
    : undefined;
  if (!binding) {
    return {
      eligible: false,
      reasonCode: "unknown_route",
      reason: `agent "${request.profile.agentId}" declares no route "${request.route}"`,
      skipped: [],
    };
  }

  const unavailable = new Set(request.unavailableModelIds ?? []);
  const requireFree = request.requireFreeTier === true || binding.requireFreeTier === true;
  const skipped: SkippedCandidate[] = [];

  for (const modelId of binding.candidateModelIds) {
    if (unavailable.has(modelId)) {
      skipped.push({
        modelId,
        reasonCode: "model_unavailable",
        reason: `model "${modelId}" is marked unavailable`,
      });
      continue;
    }

    const model = registry.getModel(modelId);
    if (!model) {
      skipped.push({
        modelId,
        reasonCode: "unknown_model",
        reason: `model "${modelId}" is not in the registry — unknown models are ineligible`,
      });
      continue;
    }

    const provider = registry.getProvider(model.providerId);
    if (!provider) {
      skipped.push({
        modelId,
        reasonCode: "unknown_provider",
        reason: `provider "${model.providerId}" is not in the registry — unknown providers are ineligible`,
      });
      continue;
    }

    if (request.requireToolUse === true) {
      if (!model.supportsToolUse || !provider.supportsToolUse) {
        skipped.push({
          modelId,
          reasonCode: "model_lacks_tool_use",
          reason: `model "${modelId}" or provider "${provider.id}" does not support tool use`,
        });
        continue;
      }
      if (provider.trustLevel === "untrusted") {
        skipped.push({
          modelId,
          reasonCode: "provider_untrusted_for_tool_use",
          reason: `provider "${provider.id}" is untrusted — tool use requires at least "reviewed"`,
        });
        continue;
      }
    }

    if (
      requireFree &&
      !isEligibleAsFree(model.pricing, {
        allowTrialOrUnknown: request.allowTrialOrUnknownAsFree === true,
      })
    ) {
      skipped.push({
        modelId,
        reasonCode: "not_proven_free",
        reason: `model "${modelId}" is not catalog-proven free and trial/unknown was not allowed`,
      });
      continue;
    }

    const adapters = registry.listAdaptersForProvider(provider.id);
    if (adapters.length === 0) {
      skipped.push({
        modelId,
        reasonCode: "no_runtime_adapter",
        reason: `provider "${provider.id}" has no runtime adapter registered`,
      });
      continue;
    }

    // Preferred local runtime: use its adapter when registered for this
    // provider; otherwise fall back to the first adapter. Never fail solely
    // because a preferred local runtime is absent.
    const preferredAdapterId = request.profile.localRuntime?.preferLocal
      ? request.profile.localRuntime.runtimeAdapterId
      : undefined;
    const adapter =
      (preferredAdapterId && adapters.find((entry) => entry.id === preferredAdapterId)) ||
      adapters[0];

    // Trust escalation: a "reviewed" (not yet allowlisted) provider running
    // tools always requires approval, whatever the adapter declares.
    const sentinelle: SentinelleGateMetadata =
      request.requireToolUse === true && provider.trustLevel !== "allowlisted"
        ? { ...adapter.sentinelle, requiresApprovalForToolUse: true }
        : adapter.sentinelle;

    return {
      eligible: true,
      modelId: model.id,
      providerId: provider.id,
      runtimeAdapterId: adapter.id,
      sentinelle,
      sentinelleRequired: true,
      ledgerRequired: true,
      pinned: binding.bindingMode === "pinned",
      reason:
        binding.bindingMode === "pinned"
          ? `pinned route "${request.route}": ${binding.pinnedReason ?? ""}`.trim()
          : `first eligible candidate on route "${request.route}"`,
      skipped,
    };
  }

  return {
    eligible: false,
    reasonCode: "no_eligible_candidate",
    reason: `no eligible candidate on route "${request.route}" for agent "${request.profile.agentId}"`,
    skipped,
  };
}
