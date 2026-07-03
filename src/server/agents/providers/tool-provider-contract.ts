// src/server/agents/providers/tool-provider-contract.ts
//
// Tool Universe Corridor — Composio-CLASS tool providers (no Composio
// dependency, no proper nouns). A tool provider exposes a large manifest of
// external tools; this contract is the sas that decides which of them may
// even be NAMED inside Oria.
//
// RULES (Master Brief §4, corridor doctrine):
//   * The tool manifest is UNTRUSTED INPUT. Descriptions are never parsed
//     for authority — this module never reads them at all.
//   * Allowlist mandatory: a tool not on the allowlist does not exist.
//   * No bulk live import: admission is per-tool, per-binding, reviewable.
//   * Every admitted tool = one explicit skillId (then Sentinelle zone,
//     then Autonomy Line, then Wager if required, then Ledger).

import type { AdapterProviderDescriptor } from "./adapter-provider-contract.ts";
import { resolveAdapterInvocation } from "./adapter-provider-contract.ts";

/** One entry of a provider manifest. `description` is untrusted and unread. */
export type ToolManifestEntry = {
  name: string;
  operation: string;
  /** Untrusted. Never grants authority; kept only for human display. */
  description: string;
};

export type ToolProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "tool_provider" };
  /** Exact tool names admitted for binding. No wildcards, reviewed by diff. */
  allowlist: readonly string[];
  /** Literal: mass-importing a live manifest is not a thing this layer can do. */
  bulkImport: "forbidden";
  manifestPolicy: {
    /** Literal: descriptions are display-only, never instructions. */
    treatDescriptionsAsUntrusted: true;
  };
};

export type ToolAdmission =
  | { admitted: false; toolName: string; reason: string }
  | { admitted: true; toolName: string; skillId: string };

/**
 * Pure per-tool admission. Fail-safe: not allowlisted → rejected; allowlisted
 * but unbound → rejected (a name on the list is not yet a capability).
 */
export function admitTool(
  contract: ToolProviderContract,
  entry: ToolManifestEntry,
): ToolAdmission {
  if (entry.name.includes("*") || !contract.allowlist.includes(entry.name)) {
    return {
      admitted: false,
      toolName: entry.name,
      reason: "Tool is not on the allowlist — unlisted tools do not exist for Oria.",
    };
  }
  const binding = contract.descriptor.skillBindings.find(
    (b) => b.operation === entry.operation,
  );
  if (!binding) {
    return {
      admitted: false,
      toolName: entry.name,
      reason: `No explicit skill binding for operation "${entry.operation}" — allowlisted is not yet capable.`,
    };
  }
  const resolution = resolveAdapterInvocation(contract.descriptor, binding.skillId);
  if (!resolution.eligible) {
    return { admitted: false, toolName: entry.name, reason: resolution.reason };
  }
  return { admitted: true, toolName: entry.name, skillId: binding.skillId };
}

/**
 * Pure manifest pass: each entry is admitted individually. There is no code
 * path that admits a manifest wholesale — that is what "no bulk live import"
 * means in practice.
 */
export function admitManifest(
  contract: ToolProviderContract,
  entries: readonly ToolManifestEntry[],
): readonly ToolAdmission[] {
  return entries.map((entry) => admitTool(contract, entry));
}
