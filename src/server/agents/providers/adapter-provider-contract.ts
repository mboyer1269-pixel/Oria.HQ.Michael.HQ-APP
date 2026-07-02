// src/server/agents/providers/adapter-provider-contract.ts
//
// Tool Universe Corridor — base adapter contract (pure, no I/O, no deps).
//
// THE central rule (ADR-001, Master Brief §4):
//   provider → adapter → skillId → Sentinelle zone → Autonomy Line
//            → Wager if required → Ledger.
//
// This module is the SHAPE of the corridor only. It contains no provider
// package, makes no external call, and — by construction — cannot authorize
// execution: the eligible arm of every resolution carries the literal
// `nextGate: "sentinelle"`. There is no code path in this layer that yields
// "execute". Sentinelle keeps the authority; the ledger keeps the proof;
// the Autonomy Lines grant the freedom.
//
// NAMESPACE NOTE: "provider" elsewhere in this repo means AI *model*
// providers (Cost Ladder). Everything here is prefixed Adapter* to keep the
// two vocabularies from bleeding into each other.
//
// FAIL-SAFE DOCTRINE (same as autonomy-tier.ts):
//   Unknown skillId        → not eligible
//   Wildcard anything      → invalid descriptor
//   Duplicate skillId      → invalid descriptor (resolution must be unambiguous)
//   Forbidden ∩ allowed    → invalid descriptor (forbidden wins)
//   Untrusted manifest     → no green-zone bindings (nothing auto-runs on
//                            unverified tool metadata)
//   Secret-looking ref     → invalid descriptor (refs name env vars, never
//                            carry values)

import type { AutonomyLevel, ExecutionZone } from "../../../core/types.ts";

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type AdapterKind =
  | "tool_provider"
  | "mailbox_provider"
  | "web_automation"
  | "cli_runtime"
  | "workflow_runtime";

// ---------------------------------------------------------------------------
// Bindings — every capability is an explicit skillId, never a wildcard
// ---------------------------------------------------------------------------

export type AdapterSkillBinding = {
  /** Explicit skill id, e.g. "mailbox.send_reply". Never "*". */
  skillId: string;
  /** Provider-side operation this skill maps to. Must be in allowedOperations. */
  operation: string;
  /** Sentinelle zone the invocation is evaluated under. */
  requiredExecutionZone: ExecutionZone;
  /** Minimum autonomy level (core AutonomyLevel) the caller must hold. */
  requiredAutonomyLevel: AutonomyLevel;
  /** Whether an approval for this skill must carry a Wager (ADR-001 §4). */
  requiresWager: boolean;
  supportsDryRun: boolean;
  supportsIdempotencyKey: boolean;
};

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export type AdapterRateLimitPolicy = {
  maxCallsPerMinute: number;
  maxCallsPerDay?: number;
  burst?: number;
};

/**
 * A REFERENCE to a secret, never a value. `envName` must look like an env
 * var name; anything value-shaped (contains '=', whitespace, or is long and
 * high-entropy-looking) invalidates the descriptor.
 */
export type AdapterSecretRef = {
  envName: string;
  purpose: string;
};

export type AdapterFailureMode =
  | "fail_closed"
  | "retry_then_dead_letter"
  | "handoff_to_ceo";

export type AdapterHandoffMode = "none" | "ceo_review" | "decision_signal";

export type AdapterProvenance = {
  /** Injected ISO timestamp — never read from a clock here. */
  registeredAt: string;
  /** Who registered the adapter (ledger identity). */
  registeredBy: string;
  /** Manifest trust: tool metadata is untrusted input until pinned. */
  manifestTrust: "untrusted" | "pinned";
  /** Required when manifestTrust is "pinned". */
  manifestHash?: string;
};

// ---------------------------------------------------------------------------
// Descriptor
// ---------------------------------------------------------------------------

export type AdapterProviderDescriptor = {
  /** Stable id `adapter:${slug}` — deterministic, never random. */
  providerId: string;
  adapterKind: AdapterKind;
  displayName: string;
  /** At least one explicit binding. Capabilities without bindings do not exist. */
  skillBindings: readonly AdapterSkillBinding[];
  allowedOperations: readonly string[];
  /** Forbidden wins over allowed; overlap invalidates the descriptor. */
  forbiddenOperations: readonly string[];
  rateLimit: AdapterRateLimitPolicy;
  secretRefs: readonly AdapterSecretRef[];
  failureMode: AdapterFailureMode;
  handoffMode: AdapterHandoffMode;
  provenance: AdapterProvenance;
};

// ---------------------------------------------------------------------------
// Validation (pure, ordered, fail-safe)
// ---------------------------------------------------------------------------

const PROVIDER_ID_PATTERN = /^adapter:[a-z0-9][a-z0-9-]*$/;
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;

/**
 * True when `envName` is a plausible env var NAME (uppercase, no '=', no
 * whitespace, bounded length). Shared by every contract that carries an
 * AdapterSecretRef outside the base descriptor's secretRefs list.
 */
export function isValidSecretRefEnvName(envName: string): boolean {
  return ENV_NAME_PATTERN.test(envName) && !envName.includes("=");
}

export type AdapterValidationResult =
  | { ok: true }
  | { ok: false; violations: readonly string[] };

export function validateAdapterDescriptor(
  d: AdapterProviderDescriptor,
): AdapterValidationResult {
  const violations: string[] = [];

  if (!PROVIDER_ID_PATTERN.test(d.providerId)) {
    violations.push(`providerId "${d.providerId}" must match adapter:<slug>.`);
  }
  if (d.skillBindings.length === 0) {
    violations.push("At least one skill binding is required — no bindings, no adapter.");
  }
  const forbidden = new Set(d.forbiddenOperations);
  for (const op of d.allowedOperations) {
    if (op.includes("*")) violations.push(`Wildcard operation "${op}" is forbidden.`);
    if (forbidden.has(op)) {
      violations.push(`Operation "${op}" is both allowed and forbidden — forbidden wins; fix the descriptor.`);
    }
  }
  const seenSkillIds = new Set<string>();
  for (const b of d.skillBindings) {
    if (!SKILL_ID_PATTERN.test(b.skillId) || b.skillId.includes("*")) {
      violations.push(`skillId "${b.skillId}" must be explicit lowercase dotted, no wildcard.`);
    }
    if (seenSkillIds.has(b.skillId)) {
      violations.push(`Duplicate binding for skillId "${b.skillId}" — resolution must be unambiguous; ambiguous descriptors are invalid.`);
    }
    seenSkillIds.add(b.skillId);
    if (!d.allowedOperations.includes(b.operation)) {
      violations.push(`Binding "${b.skillId}" maps to operation "${b.operation}" which is not in allowedOperations.`);
    }
    if (forbidden.has(b.operation)) {
      violations.push(`Binding "${b.skillId}" maps to forbidden operation "${b.operation}".`);
    }
    if (d.provenance.manifestTrust === "untrusted" && b.requiredExecutionZone === "green") {
      violations.push(`Binding "${b.skillId}" claims a green zone under an UNTRUSTED manifest — nothing auto-runs on unverified metadata.`);
    }
  }
  for (const s of d.secretRefs) {
    if (!isValidSecretRefEnvName(s.envName)) {
      violations.push(`secretRef "${s.envName}" is not a valid env var NAME — refs never carry values.`);
    }
  }
  if (!Number.isFinite(d.rateLimit.maxCallsPerMinute) || d.rateLimit.maxCallsPerMinute <= 0) {
    violations.push("rateLimit.maxCallsPerMinute must be a finite positive number.");
  }
  if (d.provenance.manifestTrust === "pinned" && !d.provenance.manifestHash) {
    violations.push("Pinned manifest requires manifestHash.");
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

// ---------------------------------------------------------------------------
// Invocation resolution — NEVER yields "execute"
// ---------------------------------------------------------------------------

export type AdapterInvocationEligibility =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      binding: AdapterSkillBinding;
      /**
       * Literal by construction: the contract layer can only hand off to
       * Sentinelle. No value of this type authorizes execution.
       */
      nextGate: "sentinelle";
      ledgerRequired: true;
    };

export function resolveAdapterInvocation(
  d: AdapterProviderDescriptor,
  skillId: string,
): AdapterInvocationEligibility {
  const valid = validateAdapterDescriptor(d);
  if (!valid.ok) {
    return { eligible: false, reason: `Descriptor invalid: ${valid.violations[0]}` };
  }
  const binding = d.skillBindings.find((b) => b.skillId === skillId);
  if (!binding) {
    return { eligible: false, reason: `No binding for skillId "${skillId}" — unknown is never eligible.` };
  }
  return { eligible: true, binding, nextGate: "sentinelle", ledgerRequired: true };
}
