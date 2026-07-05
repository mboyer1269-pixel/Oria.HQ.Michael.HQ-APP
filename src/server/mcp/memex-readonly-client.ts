// src/server/mcp/memex-readonly-client.ts
//
// Memex Read-Only Client v1 — handshake gate + read-only tool corridor.
// Design: docs/MEMEX_READONLY_CONTEXT_SOURCE_V1.md
// Contracts: memex-bridge-contract.ts · memory-evidence-pack.ts (#331)
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Evidence = preuve.
// This module may list/call ONLY allowlisted read tools after a successful
// handshake. It never writes, never proposes, never consolidates, never
// spawns on cloud hosts by default, and never treats Memex output as authority.
//
// Transport is injectable — tests use fakes; production may use controlled
// stdio (see memex-stdio-transport.ts) when env + local gate allow.

import {
  MEMEX_V1_FORBIDDEN_TOOLS,
  MEMEX_V1_READ_ALLOWLIST,
  mergeMemexContext,
  selectInjectableMemexItems,
  validateMemexBridgePolicy,
  type MemexBridgePolicy,
  type MemexContextItem,
  type MemexSelectionResult,
  type MemexToolName,
} from "@/server/mcp/memex-bridge-contract";
import {
  redactMemoryText,
  validateMemoryEvidencePack,
  type MemoryEvidencePack,
  type MemoryTrustLevel,
} from "@/server/agents/evidence/memory-evidence-pack";

// ---------------------------------------------------------------------------
// Environment gate — local stdio only; cloud never spawns Memex by default
// ---------------------------------------------------------------------------

export const MEMEX_READONLY_OPT_IN_ENV_VAR = "ORIA_ENABLE_MEMEX_READONLY";
export const MEMEX_CORE_ROOT_ENV_VAR = "MEMEX_CORE_ROOT";

const CLOUD_ENV_MARKERS: readonly string[] = [
  "VERCEL",
  "VERCEL_ENV",
  "AWS_LAMBDA_FUNCTION_NAME",
  "LAMBDA_TASK_ROOT",
  "CI",
  "GITHUB_ACTIONS",
  "K_SERVICE",
  "FLY_APP_NAME",
  "RENDER",
];

export type MemexEnvironmentKind =
  | "local_dev"
  | "local_explicit"
  | "cloud"
  | "production_unflagged"
  | "unconfigured";

export type MemexExecutionEnvironment = {
  spawnAllowed: boolean;
  kind: MemexEnvironmentKind;
  reason: string;
};

/**
 * Pure gate: cloud hosts never spawn a local Memex stdio server by default.
 * Production local builds require ORIA_ENABLE_MEMEX_READONLY=1 AND MEMEX_CORE_ROOT.
 */
export function resolveMemexExecutionEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): MemexExecutionEnvironment {
  const cloudMarker = CLOUD_ENV_MARKERS.find(
    (key) => typeof env[key] === "string" && env[key] !== "",
  );
  if (cloudMarker) {
    return {
      spawnAllowed: false,
      kind: "cloud",
      reason: `cloud marker "${cloudMarker}" — Memex stdio stays unavailable; Joris uses existing context only`,
    };
  }
  if (typeof env[MEMEX_CORE_ROOT_ENV_VAR] !== "string" || env[MEMEX_CORE_ROOT_ENV_VAR]!.trim() === "") {
    return {
      spawnAllowed: false,
      kind: "unconfigured",
      reason: `${MEMEX_CORE_ROOT_ENV_VAR} unset — no Memex path, no spawn`,
    };
  }
  if (env.NODE_ENV === "production") {
    if (env[MEMEX_READONLY_OPT_IN_ENV_VAR] !== "1") {
      return {
        spawnAllowed: false,
        kind: "production_unflagged",
        reason: `production without ${MEMEX_READONLY_OPT_IN_ENV_VAR}=1 — fail closed`,
      };
    }
    return {
      spawnAllowed: true,
      kind: "local_explicit",
      reason: "production explicitly opted into local Memex read-only",
    };
  }
  return {
    spawnAllowed: true,
    kind: "local_dev",
    reason: "non-production local environment — Memex read-only may spawn when configured",
  };
}

// ---------------------------------------------------------------------------
// Transport — injectable; the only door to MCP I/O
// ---------------------------------------------------------------------------

export type MemexMcpTransport = {
  listTools(): Promise<readonly string[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  close(): Promise<void>;
};

export const MEMEX_DEFAULT_TIMEOUT_MS = 5_000;
export const MEMEX_MAX_OUTPUT_CHARS = 8_000;

function isWildcardTool(name: string): boolean {
  return name.includes("*") || name.includes("?");
}

/** True when the tool is on the v1 read allowlist and not forbidden. */
export function isMemexReadToolPermitted(toolName: string): boolean {
  if (typeof toolName !== "string" || toolName.trim().length === 0) {
    return false;
  }
  if (isWildcardTool(toolName)) {
    return false;
  }
  const name = toolName as MemexToolName;
  if (MEMEX_V1_FORBIDDEN_TOOLS.includes(name)) {
    return false;
  }
  return MEMEX_V1_READ_ALLOWLIST.includes(name);
}

export type MemexToolDiscoveryValidation =
  | { ok: true; allowedAvailable: readonly MemexToolName[] }
  | { ok: false; errors: readonly string[] };

/** Validates discovered tools against the bridge allowlist — wildcards rejected. */
export function validateMemexToolDiscovery(
  discovered: readonly string[],
): MemexToolDiscoveryValidation {
  const errors: string[] = [];
  const names = Array.isArray(discovered) ? discovered : [];
  for (const tool of names) {
    if (isWildcardTool(tool)) {
      errors.push(`wildcard tool "${tool}" is forbidden`);
    }
  }
  const allowedAvailable = MEMEX_V1_READ_ALLOWLIST.filter((tool) => names.includes(tool));
  if (allowedAvailable.length === 0) {
    errors.push("no allowlisted read tool discovered — handshake cannot proceed");
  }
  for (const tool of names) {
    if (
      !MEMEX_V1_READ_ALLOWLIST.includes(tool as MemexToolName) &&
      !isWildcardTool(tool) &&
      typeof tool === "string" &&
      (tool.includes("write") ||
        tool.includes("delete") ||
        tool.includes("propose") ||
        tool.includes("consolidate") ||
        tool.includes("deprecate"))
    ) {
      errors.push(`destructive-sounding tool "${tool}" observed — v1 never calls it`);
    }
  }
  return errors.length === 0
    ? { ok: true, allowedAvailable }
    : { ok: false, errors };
}

export type MemexHandshakeResult =
  | {
      ok: true;
      discoveredTools: readonly string[];
      allowedTools: readonly MemexToolName[];
      probedAtIso: string;
    }
  | { ok: false; reason: string };

/**
 * Handshake gate — MUST succeed before any read tool call or Joris injection.
 * Never throws; failures become `{ ok: false, reason }`.
 */
export async function runMemexHandshake(
  transport: MemexMcpTransport,
  policy: MemexBridgePolicy,
  options?: { timeoutMs?: number },
): Promise<MemexHandshakeResult> {
  const policyCheck = validateMemexBridgePolicy(policy);
  if (!policyCheck.ok) {
    return { ok: false, reason: policyCheck.errors.join("; ") };
  }
  const timeoutMs = options?.timeoutMs ?? policy.timeoutMs ?? MEMEX_DEFAULT_TIMEOUT_MS;
  try {
    const discovered = await withTimeout(transport.listTools(), timeoutMs, "listTools timed out");
    const validation = validateMemexToolDiscovery(discovered);
    if (!validation.ok) {
      return { ok: false, reason: validation.errors.join("; ") };
    }
    return {
      ok: true,
      discoveredTools: discovered,
      allowedTools: validation.allowedAvailable,
      probedAtIso: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export type MemexReadCallResult =
  | { ok: true; text: string; redactionsApplied: number }
  | { ok: false; reason: string };

/** Calls one allowlisted read tool — forbidden names rejected before transport. */
export async function callMemexReadTool(
  transport: MemexMcpTransport,
  toolName: MemexToolName,
  args: Record<string, unknown>,
  policy: MemexBridgePolicy,
  options?: { timeoutMs?: number },
): Promise<MemexReadCallResult> {
  if (!isMemexReadToolPermitted(toolName)) {
    return { ok: false, reason: `tool "${toolName}" is not permitted in v1 read-only corridor` };
  }
  if (!policy.toolAllowlist.includes(toolName)) {
    return { ok: false, reason: `tool "${toolName}" is not on this policy allowlist` };
  }
  const timeoutMs = options?.timeoutMs ?? policy.timeoutMs ?? MEMEX_DEFAULT_TIMEOUT_MS;
  try {
    const raw = await withTimeout(
      transport.callTool(toolName, args),
      timeoutMs,
      `callTool ${toolName} timed out`,
    );
    if (typeof raw !== "string") {
      return { ok: false, reason: "MCP tool returned non-text payload" };
    }
    const bounded =
      raw.length > MEMEX_MAX_OUTPUT_CHARS ? `${raw.slice(0, MEMEX_MAX_OUTPUT_CHARS)}…` : raw;
    const { text, redactions } = redactMemoryText(bounded);
    return { ok: true, text, redactionsApplied: redactions };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Memory Evidence Pack assembly
// ---------------------------------------------------------------------------

export function workspaceIdToMemexNamespace(workspaceId: string): string {
  const normalized = workspaceId.trim().toLowerCase().replace(/-/g, ".");
  if (/^[a-z][a-z0-9._-]{0,63}$/.test(normalized)) {
    return normalized;
  }
  const prefixed = `w.${normalized.replace(/[^a-z0-9._-]/g, "")}`;
  return prefixed.slice(0, 64).replace(/\.+$/, "") || "w.unknown";
}

export function defaultMemexBridgePolicy(namespace: string): MemexBridgePolicy {
  return {
    mode: "read_only",
    toolAllowlist: [...MEMEX_V1_READ_ALLOWLIST],
    namespace,
    timeoutMs: MEMEX_DEFAULT_TIMEOUT_MS,
    maxContextChars: 4_000,
    allowAgentZone: false,
    failClosed: true,
    routingAuthority: "oria",
    sentinelleRequiredForWrites: true,
    tenantExposureForbidden: true,
  };
}

export function librarianBriefToContextItems(
  text: string,
  policy: MemexBridgePolicy,
  retrievedAtIso: string,
): MemexContextItem[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  return [
    {
      id: "memex-librarian-brief",
      zone: "human",
      deprecated: false,
      content: trimmed,
      provenance: {
        sourceTool: "agentmemory_librarian_brief",
        namespace: policy.namespace,
        retrievedAtIso,
        memexVersion: null,
      },
    },
  ];
}

export function buildMemoryEvidencePackFromSelection(input: {
  policy: MemexBridgePolicy;
  sourceTool: MemexToolName;
  selection: MemexSelectionResult;
  trustLevel?: MemoryTrustLevel;
  nowIso: string;
  redactionsApplied: number;
}): MemoryEvidencePack {
  const memoryIds = input.selection.injectable.map((item) => item.id);
  const provenance = input.selection.injectable.map((item) => ({
    memoryId: item.id,
    sourceTool: item.provenance!.sourceTool,
    namespace: item.provenance!.namespace,
    retrievedAtIso: item.provenance!.retrievedAtIso,
  }));
  return {
    packVersion: 1,
    source: "memex",
    sourceTool: input.sourceTool,
    namespace: input.policy.namespace,
    zone: "human",
    agentZonePolicyReference: null,
    memoryIds,
    provenance,
    deprecatedExcluded: true,
    trustLevel: input.trustLevel ?? "active",
    freshness: { oldestIso: input.nowIso, newestIso: input.nowIso },
    conflictPolicy: "exclude_conflicts",
    conflicts: [],
    contextBudget: input.policy.maxContextChars,
    injectedCharCount: input.selection.charCount,
    redactionsApplied: input.redactionsApplied,
    routingHintAdvisoryOnly: true,
    oriaAuthority: true,
    createdAtIso: input.nowIso,
  };
}

export type MemexContextInjectionResult = {
  context: string;
  selection: MemexSelectionResult;
  evidencePack: MemoryEvidencePack;
};

/**
 * Turns a successful librarian brief into injectable context + evidence pack.
 * Returns null when selection is empty or evidence pack fails validation.
 */
export function buildMemexContextInjection(
  existingContext: string,
  briefText: string,
  policy: MemexBridgePolicy,
  retrievedAtIso: string,
  redactionsApplied: number,
): MemexContextInjectionResult | null {
  const items = librarianBriefToContextItems(briefText, policy, retrievedAtIso);
  const selection = selectInjectableMemexItems(items, policy);
  if (selection.injectable.length === 0) {
    return null;
  }
  const evidencePack = buildMemoryEvidencePackFromSelection({
    policy,
    sourceTool: "agentmemory_librarian_brief",
    selection,
    nowIso: retrievedAtIso,
    redactionsApplied,
  });
  if (!validateMemoryEvidencePack(evidencePack).ok) {
    return null;
  }
  return {
    context: mergeMemexContext(existingContext, selection),
    selection,
    evidencePack,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
