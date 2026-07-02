// src/server/agents/models/agent-model-profile-contract.ts
//
// Agent Model Profile — the binding between a governance AgentProfile
// (src/server/agents/agent-profile-contract.ts, referenced by agentId) and
// the model routes it may use. This deliberately does NOT redefine the
// governance profile: roles, autonomy, and approval gates stay where they
// are. This contract only answers "which models may this agent reach, and
// how is that choice governed?".
//
// Anti-hardcode rule: an "auto" route with a single candidate is a vendor
// hardcode in disguise ("Joris = Claude") and is invalid. Binding one vendor
// is only expressible as an EXPLICIT pin with a written justification.
//
// No side effects, no I/O, no persistence.

import {
  validateLocalRuntimePreference,
  type ContractValidation,
  type LocalRuntimePreference,
} from "./model-provider-contract";

// ---------------------------------------------------------------------------
// Route bindings
// ---------------------------------------------------------------------------

/**
 * "auto"   — the Model Selection Policy walks the candidates in order.
 * "pinned" — an explicit, justified manual pin to a fixed candidate list.
 */
export type ModelBindingMode = "auto" | "pinned";

export type ModelRouteBinding = {
  /** Ordered candidate model ids, resolved through the Provider Registry. */
  candidateModelIds: readonly string[];
  bindingMode: ModelBindingMode;
  /** Required when pinned: why this route is vendor-fixed. */
  pinnedReason?: string;
  /** When true, this route only accepts catalog-proven free models. */
  requireFreeTier?: boolean;
};

// ---------------------------------------------------------------------------
// Agent model profile
// ---------------------------------------------------------------------------

export type AgentModelProfile = {
  /** References the governance AgentProfile.id — never redefines it. */
  agentId: string;
  displayName: string;
  /** Routes keyed by task family, e.g. "conversation", "daily-direction". */
  routes: Readonly<Record<string, ModelRouteBinding>>;
  /** Optional local-runtime preference (preferred, never assumed). */
  localRuntime?: LocalRuntimePreference;
};

// ---------------------------------------------------------------------------
// Validation — pure, no throw
// ---------------------------------------------------------------------------

export function validateModelRouteBinding(
  routeName: string,
  binding: ModelRouteBinding,
): ContractValidation {
  const errors: string[] = [];

  if (binding.candidateModelIds.length === 0) {
    errors.push(`route "${routeName}": at least one candidate model id is required`);
  }
  if (binding.candidateModelIds.some((id) => typeof id !== "string" || id.length === 0)) {
    errors.push(`route "${routeName}": candidate model ids must be non-empty strings`);
  }

  if (binding.bindingMode === "pinned") {
    if (typeof binding.pinnedReason !== "string" || binding.pinnedReason.trim().length === 0) {
      errors.push(
        `route "${routeName}": a pinned route requires a written pinnedReason — ` +
          `vendor pins are explicit decisions, never defaults`,
      );
    }
  } else if (binding.bindingMode === "auto") {
    if (binding.candidateModelIds.length < 2) {
      errors.push(
        `route "${routeName}": an "auto" route with a single candidate is a vendor ` +
          `hardcode in disguise — add alternatives or pin it explicitly with a reason`,
      );
    }
  } else {
    errors.push(`route "${routeName}": unknown binding mode "${binding.bindingMode}"`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateAgentModelProfile(profile: AgentModelProfile): ContractValidation {
  const errors: string[] = [];

  if (typeof profile.agentId !== "string" || profile.agentId.length === 0) {
    errors.push("agentId must reference a governance AgentProfile id");
  }
  if (typeof profile.displayName !== "string" || profile.displayName.trim().length === 0) {
    errors.push("displayName must be non-empty");
  }

  const routeNames = Object.keys(profile.routes);
  if (routeNames.length === 0) {
    errors.push("an agent model profile must declare at least one route");
  }
  for (const routeName of routeNames) {
    const validation = validateModelRouteBinding(routeName, profile.routes[routeName]);
    if (!validation.ok) errors.push(...validation.errors);
  }

  if (profile.localRuntime) {
    const validation = validateLocalRuntimePreference(profile.localRuntime);
    if (!validation.ok) errors.push(...validation.errors);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
