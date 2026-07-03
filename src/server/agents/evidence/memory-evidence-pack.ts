// src/server/agents/evidence/memory-evidence-pack.ts
//
// Memory Evidence Pack v1 — the BLACK BOX every memory injection must fill in
// before Oria lets it near Joris. Design: docs/AGENT_EVIDENCE_PACKS_V1.md
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// A memory injected without provenance is a persistent hallucination with a
// good memory. This pack exists so the Command Tower can answer, for any
// context injection: where it came from, which memories, how fresh, how
// trusted, what was excluded, what it cost in context budget — and prove
// that the memory NEVER carried authority over models, tools, Sentinelle,
// or the Ledger.
//
// Invariants encoded here:
//    1. The field set is CLOSED — unknown fields are rejected.
//    2. No injection without provenance: every memoryId needs a provenance
//       entry, every provenance entry needs a memoryId.
//    3. deprecatedExcluded is the literal `true` — deprecated memories are
//       out by default, and v1 offers no opt-in.
//    4. Zone "unknown" (or anything outside human/agent/system) is rejected.
//    5. The agent zone requires an explicit policy reference.
//    6. Path traversal in source paths is rejected.
//    7. routingHintAdvisoryOnly and oriaAuthority are the literal `true` —
//       memory can never override an Oria model decision.
//    8. Memory cannot authorize tool use, disable Sentinelle, or mutate the
//       Ledger: those field names are inexpressible (closed set + forbidden
//       name scan) and applyMemoryHint is the executable proof for routing.
//    9. Conflicts are MARKED, never silently merged.
//   10. The context budget is enforced: injectedCharCount ≤ contextBudget.
//   11. Secret-like values in memory content are redacted before packing.
//   12. v1 is read-only: no write/propose/consolidation source is expressible.
//
// No side effects, no I/O, no network, no MCP call, no process.env reads.
// This module validates evidence about memory reads; it never reads memory.

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** Where injected memory may come from. Write paths are not in here (inv. 12). */
export type MemorySource = "memex" | "local_vault" | "session" | "imported_doc";

/** Memory zones. "system" covers Oria-generated operational memory. */
export type MemoryZone = "human" | "agent" | "system";

export type MemoryTrustLevel = "verified" | "active" | "proposed" | "untrusted";

export type MemoryFreshness = {
  /** Oldest and newest memory timestamps in the injected set. */
  oldestIso: string;
  newestIso: string;
};

/** How conflicting memories were handled. Silent merge is inexpressible. */
export type MemoryConflictPolicy = "exclude_conflicts" | "mark_conflicts";

export type MemoryProvenanceEntry = {
  memoryId: string;
  /** The tool or mechanism that produced this memory read. */
  sourceTool: string;
  namespace: string;
  retrievedAtIso: string;
};

/** A conflict is a FINDING to display, never something to paper over. */
export type MemoryConflictMark = {
  memoryIds: readonly string[];
  reason: string;
};

export type MemoryEvidencePack = {
  packVersion: 1;
  source: MemorySource;
  sourceTool: string;
  namespace: string;
  zone: MemoryZone;
  /** Required (non-empty) when zone is "agent" (invariant 5). */
  agentZonePolicyReference: string | null;
  memoryIds: readonly string[];
  provenance: readonly MemoryProvenanceEntry[];
  /** Literal true — deprecated memories are excluded, no v1 opt-in (inv. 3). */
  deprecatedExcluded: true;
  trustLevel: MemoryTrustLevel;
  freshness: MemoryFreshness;
  conflictPolicy: MemoryConflictPolicy;
  conflicts: readonly MemoryConflictMark[];
  contextBudget: number;
  injectedCharCount: number;
  redactionsApplied: number;
  /** Literal true — hints inform, they never decide (invariant 7). */
  routingHintAdvisoryOnly: true;
  /** Literal true — Oria keeps the final authority (invariant 7). */
  oriaAuthority: true;
  createdAtIso: string;
};

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const NAMESPACE_PATTERN = /^[a-z][a-z0-9._-]{0,63}$/;

export function isValidMemoryNamespace(value: unknown): value is string {
  return typeof value === "string" && NAMESPACE_PATTERN.test(value);
}

/**
 * Rejects path traversal, absolute paths, and drive letters in memory ids
 * that look like vault paths (invariant 6). Non-path ids pass untouched.
 */
export function isSafeMemoryId(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    return false;
  }
  if (value.includes("..") || value.includes("\\") || value.startsWith("/")) {
    return false;
  }
  if (/^[A-Za-z]:/.test(value) || value.includes("\0")) {
    return false;
  }
  return !value.split("/").some((segment) => segment === "");
}

/**
 * Field names that must never appear ANYWHERE in a memory evidence pack —
 * memory is context, never credentials and never authority (invariant 8).
 */
export const FORBIDDEN_MEMORY_FIELDS: readonly string[] = [
  "token",
  "accesstoken",
  "access_token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "cookie",
  "session",
  "oauth",
  // Authority-grab shapes — memory cannot claim these powers.
  "toolauthorization",
  "tool_authorization",
  "allowedtools",
  "allowed_tools",
  "sentinellebypass",
  "sentinelle_bypass",
  "sentinelledisabled",
  "sentinelle_disabled",
  "ledgerwrite",
  "ledger_write",
  "ledgermutation",
  "ledger_mutation",
  "modeldecision",
  "model_decision",
  "routingauthority",
  "routing_authority",
];

/** Deep-scans a value for forbidden field names. Returns the offending paths. */
export function findForbiddenMemoryFields(value: unknown, path = ""): readonly string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_MEMORY_FIELDS.includes(key.toLowerCase())) {
      found.push(keyPath);
    }
    found.push(...findForbiddenMemoryFields(child, keyPath));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Redaction — memory content is a prompt-injection and leak surface
// ---------------------------------------------------------------------------

const REDACTION_RULES: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[email redacted]" },
  { pattern: /\b(?:sk|pk|rk|key)-[A-Za-z0-9_-]{8,}\b/gi, replacement: "[key redacted]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "[bearer redacted]" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\b/g, replacement: "[jwt redacted]" },
  { pattern: /\bamh1\.[A-Za-z0-9._-]+/g, replacement: "[handle redacted]" },
];

/** Redacts secret-looking values from memory content, counting rule hits. */
export function redactMemoryText(text: string): { text: string; redactions: number } {
  let out = typeof text === "string" ? text : String(text ?? "");
  let redactions = 0;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, () => {
      redactions += 1;
      return rule.replacement;
    });
  }
  return { text: out, redactions };
}

// ---------------------------------------------------------------------------
// Validation — pure, no throw, no I/O
// ---------------------------------------------------------------------------

export type ContractValidation = { ok: true } | { ok: false; errors: readonly string[] };

const SOURCES = Object.keys({
  memex: true,
  local_vault: true,
  session: true,
  imported_doc: true,
} satisfies Record<MemorySource, true>) as readonly MemorySource[];
const ZONES = Object.keys({
  human: true,
  agent: true,
  system: true,
} satisfies Record<MemoryZone, true>) as readonly MemoryZone[];
const TRUST_LEVELS = Object.keys({
  verified: true,
  active: true,
  proposed: true,
  untrusted: true,
} satisfies Record<MemoryTrustLevel, true>) as readonly MemoryTrustLevel[];
const CONFLICT_POLICIES = Object.keys({
  exclude_conflicts: true,
  mark_conflicts: true,
} satisfies Record<MemoryConflictPolicy, true>) as readonly MemoryConflictPolicy[];

/** The CLOSED field set (invariant 1). Anything else is rejected. */
const PACK_FIELDS: readonly string[] = [
  "packVersion",
  "source",
  "sourceTool",
  "namespace",
  "zone",
  "agentZonePolicyReference",
  "memoryIds",
  "provenance",
  "deprecatedExcluded",
  "trustLevel",
  "freshness",
  "conflictPolicy",
  "conflicts",
  "contextBudget",
  "injectedCharCount",
  "redactionsApplied",
  "routingHintAdvisoryOnly",
  "oriaAuthority",
  "createdAtIso",
];

export const MAX_MEMORY_IDS = 100;
export const MAX_CONTEXT_BUDGET_CHARS = 20_000;

function isNonEmptyString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function validateMemoryEvidencePack(pack: MemoryEvidencePack): ContractValidation {
  if (pack === null || typeof pack !== "object") {
    return { ok: false, errors: ["pack must be an object"] };
  }
  const errors: string[] = [];

  // Invariant 1: closed field set.
  for (const field of Object.keys(pack)) {
    if (!PACK_FIELDS.includes(field)) {
      errors.push(
        `field "${field}" is not part of the Memory Evidence Pack v1 contract — ` +
          `memory cannot smuggle authority or credentials through evidence`,
      );
    }
  }

  // Invariant 8: no secret/authority field names anywhere, deep.
  for (const offending of findForbiddenMemoryFields(pack)) {
    errors.push(
      `forbidden field "${offending}" — memory is context, never credentials or authority`,
    );
  }

  if ((pack.packVersion as number) !== 1) {
    errors.push("packVersion must be the literal 1");
  }
  // Invariant 12: only read sources are expressible.
  if (!SOURCES.includes(pack.source)) {
    errors.push(`source "${pack.source}" is not a sanctioned v1 read source`);
  }
  if (!isNonEmptyString(pack.sourceTool, 120)) {
    errors.push("sourceTool must identify the mechanism that read the memory");
  }
  if (!isValidMemoryNamespace(pack.namespace)) {
    errors.push(`namespace "${pack.namespace}" is invalid — lowercase dotted identifier, no paths`);
  }
  // Invariant 4: unknown zones are rejected.
  if (!ZONES.includes(pack.zone)) {
    errors.push(`zone "${pack.zone}" is not injectable — human, agent, or system only`);
  }
  // Invariant 5: agent zone requires explicit policy.
  if (pack.zone === "agent" && !isNonEmptyString(pack.agentZonePolicyReference ?? "", 200)) {
    errors.push(
      "agent-zone injection requires an explicit agentZonePolicyReference — " +
        "agent-written memory does not ride in on defaults",
    );
  }

  const memoryIds = Array.isArray(pack.memoryIds) ? pack.memoryIds : [];
  if (!Array.isArray(pack.memoryIds) || memoryIds.length === 0) {
    errors.push("memoryIds must be a non-empty array — an empty injection needs no pack");
  }
  if (memoryIds.length > MAX_MEMORY_IDS) {
    errors.push(`memoryIds exceeds the ${MAX_MEMORY_IDS}-id bound`);
  }
  // Invariant 6: traversal-shaped ids are rejected.
  for (const id of memoryIds) {
    if (!isSafeMemoryId(id)) {
      errors.push(`memoryId "${id}" is unsafe — traversal, absolute, or malformed`);
    }
  }

  // Invariant 2: provenance ↔ memoryIds, both directions.
  const provenance = Array.isArray(pack.provenance) ? pack.provenance : [];
  if (!Array.isArray(pack.provenance) || provenance.length === 0) {
    errors.push("provenance must be a non-empty array — no injection without provenance");
  }
  const provenancedIds = new Set<string>();
  provenance.forEach((entry, index) => {
    const where = `provenance[${index}]`;
    if (entry === null || typeof entry !== "object") {
      errors.push(`${where}: malformed provenance entry`);
      return;
    }
    if (!isNonEmptyString(entry.memoryId, 256)) {
      errors.push(`${where}: memoryId is required`);
    } else {
      provenancedIds.add(entry.memoryId);
    }
    if (!isNonEmptyString(entry.sourceTool, 120)) {
      errors.push(`${where}: sourceTool is required`);
    }
    if (!isValidMemoryNamespace(entry.namespace)) {
      errors.push(`${where}: namespace "${entry.namespace}" is invalid`);
    } else if (isValidMemoryNamespace(pack.namespace) && entry.namespace !== pack.namespace) {
      errors.push(
        `${where}: namespace "${entry.namespace}" does not match the pack scope "${pack.namespace}"`,
      );
    }
    if (!isIsoTimestamp(entry.retrievedAtIso)) {
      errors.push(`${where}: retrievedAtIso must be a valid ISO timestamp`);
    }
  });
  for (const id of memoryIds) {
    if (typeof id === "string" && !provenancedIds.has(id)) {
      errors.push(`memoryId "${id}" has no provenance entry — untraceable context is noise`);
    }
  }

  // Invariant 3: deprecated exclusion has no opt-out.
  if ((pack.deprecatedExcluded as boolean) !== true) {
    errors.push("deprecatedExcluded must be the literal true — v1 offers no opt-in");
  }
  if (!TRUST_LEVELS.includes(pack.trustLevel)) {
    errors.push(`trustLevel "${pack.trustLevel}" is not a known level`);
  }

  const freshness = pack.freshness;
  if (
    freshness === null ||
    typeof freshness !== "object" ||
    !isIsoTimestamp(freshness.oldestIso) ||
    !isIsoTimestamp(freshness.newestIso)
  ) {
    errors.push("freshness must carry valid oldestIso/newestIso — evidence ages with its source");
  } else if (Date.parse(freshness.oldestIso) > Date.parse(freshness.newestIso)) {
    errors.push("freshness.oldestIso cannot be newer than freshness.newestIso");
  }

  // Invariant 9: conflicts are marked, never silently merged.
  if (!CONFLICT_POLICIES.includes(pack.conflictPolicy)) {
    errors.push(
      `conflictPolicy "${pack.conflictPolicy}" is not sanctioned — ` +
        "silent merge is inexpressible; conflicts are excluded or marked",
    );
  }
  const conflicts = Array.isArray(pack.conflicts) ? pack.conflicts : [];
  if (!Array.isArray(pack.conflicts)) {
    errors.push("conflicts must be an array (empty when none were found)");
  }
  conflicts.forEach((mark, index) => {
    const where = `conflicts[${index}]`;
    if (mark === null || typeof mark !== "object") {
      errors.push(`${where}: malformed conflict mark`);
      return;
    }
    if (!Array.isArray(mark.memoryIds) || mark.memoryIds.length < 2) {
      errors.push(`${where}: a conflict names at least two memoryIds`);
    }
    if (!isNonEmptyString(mark.reason, 300)) {
      errors.push(`${where}: a conflict carries a displayable reason`);
    }
  });

  // Invariant 10: the context budget is enforced.
  if (
    typeof pack.contextBudget !== "number" ||
    pack.contextBudget <= 0 ||
    pack.contextBudget > MAX_CONTEXT_BUDGET_CHARS
  ) {
    errors.push(
      `contextBudget must be within (0, ${MAX_CONTEXT_BUDGET_CHARS}] — ` +
        "unbounded context is a prompt-injection amplifier",
    );
  }
  if (typeof pack.injectedCharCount !== "number" || pack.injectedCharCount < 0) {
    errors.push("injectedCharCount must be a non-negative number");
  } else if (
    typeof pack.contextBudget === "number" &&
    pack.injectedCharCount > pack.contextBudget
  ) {
    errors.push(
      `injectedCharCount ${pack.injectedCharCount} exceeds contextBudget ${pack.contextBudget} — ` +
        "the budget is a wall, not a suggestion",
    );
  }
  if (typeof pack.redactionsApplied !== "number" || pack.redactionsApplied < 0) {
    errors.push("redactionsApplied must be a non-negative count");
  }

  // Invariant 7: authority literals.
  if ((pack.routingHintAdvisoryOnly as boolean) !== true) {
    errors.push("routingHintAdvisoryOnly must be the literal true — hints inform, never decide");
  }
  if ((pack.oriaAuthority as boolean) !== true) {
    errors.push("oriaAuthority must be the literal true — Memex orients, Oria governs");
  }
  if (!isIsoTimestamp(pack.createdAtIso)) {
    errors.push("createdAtIso must be a valid ISO timestamp");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Authority proofs — executable, not aspirational (invariant 7 and 8)
// ---------------------------------------------------------------------------

/** Oria's model decision. The shape carries its own authority marker. */
export type OriaModelDecision = {
  modelId: string;
  decidedBy: "oria_model_policy";
};

/** An advisory hint memory may carry. Information, never a decision. */
export type MemoryRoutingHint = {
  suggestedModelId: string | null;
  estimatedCostTier: "free" | "low" | "medium" | "high" | null;
};

/**
 * Applies a memory routing hint to an Oria decision: the decision comes back
 * IDENTICAL. This is the executable proof that memory cannot steer models.
 */
export function applyMemoryRoutingHint(
  decision: OriaModelDecision,
  _hint: MemoryRoutingHint | null,
): OriaModelDecision {
  return { modelId: decision.modelId, decidedBy: "oria_model_policy" };
}

export type ToolUseAuthorization = { authorized: boolean; reason: string };

/**
 * Memory can NEVER authorize a tool. Whatever the pack says, the answer is a
 * refusal that points at the real authorities (Sentinelle + Oria policy).
 */
export function toolUseAuthorizationFromMemory(
  _pack: MemoryEvidencePack,
  toolName: string,
): ToolUseAuthorization {
  return {
    authorized: false,
    reason:
      `memory evidence cannot authorize tool "${toolName}" — tool use is decided by ` +
      "Oria policy and gated by Sentinelle, never by injected context",
  };
}
