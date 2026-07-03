// src/server/agents/providers/web-automation-provider-contract.ts
//
// Tool Universe Corridor — browser / web-automation providers. A web agent
// can observe and act on external sites; this contract forces every action
// to leave PROOF and pushes anything destructive to the CEO.
//
// RULES:
//   * Proof mandatory: an action without evidence (screenshot, log, result
//     payload) did not happen as far as the ledger is concerned.
//   * Destructive operations (deleting data, mutating irreversibly) are
//     CEO-click only ("A4" in the Master Brief §8 naming). No line, no zone,
//     no score overrides this.
//   * Fail-safe: an operation whose effects are not fully declared is
//     treated as destructive.

import type { AdapterProviderDescriptor } from "./adapter-provider-contract.ts";

export type WebEvidenceKind = "screenshot" | "log" | "result_payload";

export type WebAutomationProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "web_automation" };
  proofPolicy: {
    /** At least one kind; an EMPTY policy fails closed in requireEvidence(). */
    requiredEvidence: readonly WebEvidenceKind[];
  };
  /** Literal: destructive web actions have exactly one trigger — the CEO. */
  destructivePolicy: "ceo_click_only";
};

// ---------------------------------------------------------------------------
// Operation classification (pure, fail-safe)
// ---------------------------------------------------------------------------

export type WebOperationEffects = {
  readsOnly: boolean;
  mutatesExternalState: boolean;
  deletesData: boolean;
  /** True when the effects above are fully declared by the adapter author. */
  effectsDeclared: boolean;
};

export type WebOperationClass = "observe" | "reversible" | "destructive";

export function classifyWebOperation(effects: WebOperationEffects): WebOperationClass {
  if (!effects.effectsDeclared) return "destructive";
  if (effects.deletesData) return "destructive";
  if (effects.mutatesExternalState) return "reversible";
  if (effects.readsOnly) return "observe";
  return "destructive";
}

/** Destructive → CEO click, always. */
export function requiresCeoClick(effects: WebOperationEffects): boolean {
  return classifyWebOperation(effects) === "destructive";
}

// ---------------------------------------------------------------------------
// Evidence gate (pure)
// ---------------------------------------------------------------------------

export type WebEvidenceCheck =
  | { ok: true }
  | { ok: false; missing: readonly WebEvidenceKind[] };

const ALL_EVIDENCE_KINDS: readonly WebEvidenceKind[] = [
  "screenshot",
  "log",
  "result_payload",
];

/**
 * Every required evidence kind must be present in what the automation
 * actually captured. Missing proof fails the action's ledger entry — it does
 * not downgrade to "trust me". An empty requiredEvidence policy is a
 * misconfiguration that would silently disable the proof gate, so it fails
 * closed by demanding every kind.
 */
export function requireEvidence(
  contract: WebAutomationProviderContract,
  captured: readonly WebEvidenceKind[],
): WebEvidenceCheck {
  if (contract.proofPolicy.requiredEvidence.length === 0) {
    return { ok: false, missing: ALL_EVIDENCE_KINDS };
  }
  const missing = contract.proofPolicy.requiredEvidence.filter(
    (kind) => !captured.includes(kind),
  );
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
