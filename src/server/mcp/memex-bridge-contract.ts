// src/server/mcp/memex-bridge-contract.ts
//
// Pure contracts for the MEMEX READ-ONLY BRIDGE — the future MCP corridor
// between Oria and Memex Core (local repo: memex-core, MCP server
// "memex-core-mcp"). Design: docs/MEMEX_BRIDGE_REALITY_GATE.md
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// Memex feeds decisions with context and provenance; Oria keeps the final
// authority on models, risk, approvals, ledger, and dispatch. An MCP server
// is untrusted by default — its output is context material, never commands.
//
// Invariants encoded here:
//    1. v1 is READ-ONLY: the tool allowlist can only name read tools; every
//       write/propose/vault-write tool is inexpressible in a valid policy.
//    2. No wildcard tools — each tool is allowlisted by exact name.
//    3. Every injected context item carries provenance or it is rejected.
//    4. Deprecated memories are excluded by default.
//    5. Zone "unknown" is rejected; "agent" zone requires explicit policy.
//    6. Path traversal is rejected before any vault path is even considered.
//    7. Routing hints from Memex can NEVER override an Oria model decision.
//    8. Fail-closed: Memex unavailable/timeout → existing context unchanged.
//    9. Context size is bounded — a hard character cap, never "trust the pack".
//   10. A personal memory fabric is never exposed to tenants or customers.
//
// No side effects, no I/O, no network, no MCP runtime coupling. This module
// exists so the future live connector has a contract to obey — the same
// pattern that carried the Local Runtime Gate (#325) into the probe (#328).

// ---------------------------------------------------------------------------
// Vocabulary — tool names mirror memex-core fixtures/mcp-tools-list.expected.json
// ---------------------------------------------------------------------------

/** Every MCP tool memex-core v0.7.0 actually exposes. */
export type MemexToolName =
  | "agentmemory_graph_query"
  | "agentmemory_context_pack"
  | "agentmemory_librarian_brief"
  | "agentmemory_latest_updates"
  | "agentmemory_project_state"
  | "agentmemory_tool_catalog_search"
  | "agentmemory_submit_proposal"
  | "agentmemory_read_vault_file"
  | "agentmemory_write_vault_file"
  | "agentmemory_search_vault";

const ALL_MEMEX_TOOLS = Object.keys({
  agentmemory_graph_query: true,
  agentmemory_context_pack: true,
  agentmemory_librarian_brief: true,
  agentmemory_latest_updates: true,
  agentmemory_project_state: true,
  agentmemory_tool_catalog_search: true,
  agentmemory_submit_proposal: true,
  agentmemory_read_vault_file: true,
  agentmemory_write_vault_file: true,
  agentmemory_search_vault: true,
} satisfies Record<MemexToolName, true>) as readonly MemexToolName[];

/**
 * The ONLY tools a v1 bridge policy may allowlist: pure context reads.
 * Vault file reads are deliberately excluded in v1 — file paths are a
 * traversal surface the bridge does not need to touch to be useful.
 */
export const MEMEX_V1_READ_ALLOWLIST: readonly MemexToolName[] = [
  "agentmemory_context_pack",
  "agentmemory_librarian_brief",
  "agentmemory_project_state",
  "agentmemory_latest_updates",
];

/** Tools that are forbidden in ANY v1 policy — write, propose, vault I/O. */
export const MEMEX_V1_FORBIDDEN_TOOLS: readonly MemexToolName[] = [
  "agentmemory_submit_proposal",
  "agentmemory_write_vault_file",
  "agentmemory_read_vault_file",
  "agentmemory_search_vault",
  "agentmemory_graph_query",
  "agentmemory_tool_catalog_search",
];

/** Memory zones, mirroring the Memex fabric. "unknown" is a rejection. */
export type MemexZone = "human" | "agent" | "unknown";

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

/** Where a context item came from — mandatory, or the item is rejected. */
export type MemexProvenance = {
  sourceTool: MemexToolName;
  namespace: string;
  retrievedAtIso: string;
  /** memex-core version string when known — evidence ages with its source. */
  memexVersion: string | null;
};

export type MemexContextItem = {
  id: string;
  zone: MemexZone;
  /** Deprecated memories are excluded by default (invariant 4). */
  deprecated: boolean;
  content: string;
  provenance: MemexProvenance | null;
};

/**
 * Advisory routing hint Memex may attach to a pack. It is INFORMATION —
 * cost estimates and availability — never a decision (invariant 7).
 */
export type MemexRoutingHint = {
  suggestedModelId: string | null;
  estimatedCostTier: "free" | "low" | "medium" | "high" | null;
  localRuntimeAvailable: boolean | null;
};

/** Oria's model decision. The shape carries its own authority marker. */
export type OriaModelDecision = {
  modelId: string;
  decidedBy: "oria_model_policy";
};

export type MemexBridgePolicy = {
  /** v1 is read-only — the literal type forbids anything else. */
  mode: "read_only";
  /** Exact tool names only — validated against the v1 read allowlist. */
  toolAllowlist: readonly MemexToolName[];
  /** Namespace the bridge is scoped to (e.g. "michael.oria"). */
  namespace: string;
  timeoutMs: number;
  maxContextChars: number;
  /** "agent" zone items are excluded unless this is explicitly true. */
  allowAgentZone: boolean;
  /** The type forbids opting out of any of these. Validators guard data. */
  failClosed: true;
  routingAuthority: "oria";
  sentinelleRequiredForWrites: true;
  tenantExposureForbidden: true;
};

// ---------------------------------------------------------------------------
// Validation — pure, no throw, no I/O
// ---------------------------------------------------------------------------

export type ContractValidation = { ok: true } | { ok: false; errors: readonly string[] };

export const MEMEX_MIN_TIMEOUT_MS = 500;
export const MEMEX_MAX_TIMEOUT_MS = 15_000;
export const MEMEX_MAX_CONTEXT_CHARS_CEILING = 20_000;

const NAMESPACE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

/** True when the string is a plausible Memex namespace, not a path or glob. */
export function isValidMemexNamespace(value: unknown): value is string {
  return typeof value === "string" && NAMESPACE_PATTERN.test(value);
}

/**
 * Rejects path traversal and absolute paths BEFORE any vault path could be
 * used. v1 has no vault tools at all, but the guard exists so v2 cannot
 * forget it (invariant 6).
 */
export function isSafeVaultRelativePath(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return false;
  }
  if (value.includes("..") || value.includes("\\") || value.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(value) || value.includes("\0")) {
    return false;
  }
  return /^[A-Za-z0-9._\-/]+$/.test(value) && !value.split("/").some((seg) => seg === "");
}

export function validateMemexBridgePolicy(policy: MemexBridgePolicy): ContractValidation {
  const errors: string[] = [];

  if ((policy.mode as string) !== "read_only") {
    errors.push(`bridge mode "${policy.mode}" is not sanctioned — v1 is read_only or nothing`);
  }

  if (!Array.isArray(policy.toolAllowlist) || policy.toolAllowlist.length === 0) {
    errors.push("toolAllowlist must be a non-empty list of exact tool names");
  } else {
    for (const tool of policy.toolAllowlist) {
      const name = tool as string;
      if (name.includes("*") || name.includes("?")) {
        errors.push(`tool "${name}": wildcards are forbidden — allowlist by exact name`);
      } else if (MEMEX_V1_FORBIDDEN_TOOLS.includes(tool)) {
        errors.push(
          `tool "${name}" is forbidden in v1 — write/propose/vault tools wait for the ` +
            `propose-approve bridge (v2) behind Sentinelle`,
        );
      } else if (!MEMEX_V1_READ_ALLOWLIST.includes(tool)) {
        errors.push(
          `tool "${name}" is not on the v1 read allowlist — unknown tools are not callable`,
        );
      }
    }
  }

  if (!isValidMemexNamespace(policy.namespace)) {
    errors.push(
      `namespace "${policy.namespace}" is invalid — lowercase dotted identifier, no paths`,
    );
  }
  if (
    typeof policy.timeoutMs !== "number" ||
    policy.timeoutMs < MEMEX_MIN_TIMEOUT_MS ||
    policy.timeoutMs > MEMEX_MAX_TIMEOUT_MS
  ) {
    errors.push(
      `timeoutMs must be between ${MEMEX_MIN_TIMEOUT_MS} and ${MEMEX_MAX_TIMEOUT_MS} — ` +
        `a bridge without a deadline is a hang, not a bridge`,
    );
  }
  if (
    typeof policy.maxContextChars !== "number" ||
    policy.maxContextChars <= 0 ||
    policy.maxContextChars > MEMEX_MAX_CONTEXT_CHARS_CEILING
  ) {
    errors.push(
      `maxContextChars must be within (0, ${MEMEX_MAX_CONTEXT_CHARS_CEILING}] — ` +
        `unbounded context is a prompt-injection amplifier`,
    );
  }

  // The type already forbids these; validators guard untyped data.
  if ((policy.failClosed as boolean) !== true) {
    errors.push("failClosed must be true — Memex down means fallback, never a crash");
  }
  if ((policy.routingAuthority as string) !== "oria") {
    errors.push(
      `routingAuthority "${policy.routingAuthority}" is not sanctioned — Memex orients, Oria governs`,
    );
  }
  if ((policy.sentinelleRequiredForWrites as boolean) !== true) {
    errors.push("sentinelleRequiredForWrites must be true — no write path without the gate");
  }
  if ((policy.tenantExposureForbidden as boolean) !== true) {
    errors.push(
      "tenantExposureForbidden must be true — a personal memory fabric never serves tenants",
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Context selection — pure filtering with per-item rejection reasons
// ---------------------------------------------------------------------------

export type MemexSelectionResult = {
  /** Items that may be injected, in input order, within the char budget. */
  injectable: readonly MemexContextItem[];
  /** Non-sensitive audit trail: id → why the item was excluded. */
  rejected: readonly { id: string; reason: string }[];
  /** Total characters of injectable content (≤ policy.maxContextChars). */
  charCount: number;
};

/**
 * Filters a pack of context items against the policy. Deterministic, never
 * throws: malformed items become rejections with reasons, not crashes.
 */
export function selectInjectableMemexItems(
  items: readonly MemexContextItem[],
  policy: MemexBridgePolicy,
): MemexSelectionResult {
  const injectable: MemexContextItem[] = [];
  const rejected: { id: string; reason: string }[] = [];
  let charCount = 0;

  for (const item of Array.isArray(items) ? items : []) {
    const id = typeof item?.id === "string" && item.id.length > 0 ? item.id : "(no id)";
    if (item === null || typeof item !== "object") {
      rejected.push({ id, reason: "malformed item" });
      continue;
    }
    if (item.deprecated === true) {
      rejected.push({ id, reason: "deprecated memories are excluded by default" });
      continue;
    }
    if (item.zone === "unknown" || (item.zone !== "human" && item.zone !== "agent")) {
      rejected.push({ id, reason: `zone "${item.zone}" is not injectable` });
      continue;
    }
    if (item.zone === "agent" && policy.allowAgentZone !== true) {
      rejected.push({ id, reason: "agent-zone item requires allowAgentZone policy" });
      continue;
    }
    const provenance = item.provenance;
    if (
      provenance === null ||
      typeof provenance !== "object" ||
      !MEMEX_V1_READ_ALLOWLIST.includes(provenance.sourceTool) ||
      !isValidMemexNamespace(provenance.namespace) ||
      typeof provenance.retrievedAtIso !== "string" ||
      Number.isNaN(Date.parse(provenance.retrievedAtIso))
    ) {
      rejected.push({ id, reason: "missing or invalid provenance — untraceable context is noise" });
      continue;
    }
    if (provenance.namespace !== policy.namespace) {
      rejected.push({
        id,
        reason: `provenance namespace "${provenance.namespace}" does not match the bridge scope`,
      });
      continue;
    }
    if (typeof item.content !== "string" || item.content.trim().length === 0) {
      rejected.push({ id, reason: "empty content" });
      continue;
    }
    if (charCount + item.content.length > policy.maxContextChars) {
      rejected.push({ id, reason: "over the context character budget" });
      continue;
    }
    charCount += item.content.length;
    injectable.push(item);
  }

  return { injectable, rejected, charCount };
}

/**
 * Fail-closed merge: the existing context always survives. A null pack
 * (Memex unavailable, timeout, error) returns the existing context untouched
 * (invariant 8) — the bridge can only ADD, and only within policy.
 */
export function mergeMemexContext(
  existingContext: string,
  selection: MemexSelectionResult | null,
): string {
  if (selection === null || selection.injectable.length === 0) {
    return existingContext;
  }
  const lines = selection.injectable.map(
    (item) =>
      `[MEMEX:${item.zone}] ${item.content} (source: ${item.provenance?.sourceTool ?? "?"} · ${item.provenance?.retrievedAtIso ?? "?"})`,
  );
  return `${existingContext}\n--- Contexte Memex (${selection.injectable.length} item${selection.injectable.length > 1 ? "s" : ""}, advisory, provenance citée) ---\n${lines.join("\n")}\n---`;
}

// ---------------------------------------------------------------------------
// Routing authority — hints inform, Oria decides
// ---------------------------------------------------------------------------

/**
 * Applies a Memex routing hint to an Oria decision: the decision comes back
 * IDENTICAL. The hint exists for display and cost telemetry only — this
 * function is the executable proof that Memex cannot steer model choice.
 */
export function applyMemexRoutingHint(
  decision: OriaModelDecision,
  _hint: MemexRoutingHint | null,
): OriaModelDecision {
  return { modelId: decision.modelId, decidedBy: "oria_model_policy" };
}
