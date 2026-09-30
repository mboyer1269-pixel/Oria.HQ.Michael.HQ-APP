import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  callMemexReadTool,
  defaultMemexBridgePolicy,
  runMemexHandshake,
  workspaceIdToMemexNamespace,
  type MemexMcpTransport,
} from "@/server/mcp/memex-readonly-client";
import { isValidMemexNamespace } from "@/server/mcp/memex-bridge-contract";

export const OPENHANDS_MEMORY_CONTEXT_MAX_CHARS = 4_000;
const MAX_CONTEXT_ENTITIES = 12;
const MAX_CONTEXT_RELATIONS = 16;

/** Returned only by a trusted server resolver backed by an explicit project mapping. */
export type OpenHandsProjectMemoryBinding = Readonly<{
  workspaceId: string;
  projectId: string;
  namespace: string;
  namespaceScope: "project";
  centerEntityId: string;
}>;

export type OpenHandsMemoryContextSnapshot = Readonly<{
  contractVersion: 1;
  sourceTool: "agentmemory_context_pack";
  workspaceId: string;
  projectId: string;
  namespace: string;
  centerEntityId: string;
  retrievedAtIso: string;
  content: string;
  contentChars: number;
  redactionsApplied: number;
  snapshotHash: string;
}>;

const snapshotSchema = z.object({
  contractVersion: z.literal(1), sourceTool: z.literal("agentmemory_context_pack"),
  workspaceId: z.string().trim().min(1).max(160), projectId: z.string().trim().min(1).max(160),
  namespace: z.string().min(1).max(256), centerEntityId: z.string().min(1).max(160),
  retrievedAtIso: z.iso.datetime({ offset: true }),
  content: z.string().min(1).max(OPENHANDS_MEMORY_CONTEXT_MAX_CHARS),
  contentChars: z.number().int().min(1).max(OPENHANDS_MEMORY_CONTEXT_MAX_CHARS),
  redactionsApplied: z.number().int().nonnegative(), snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Integrity only: callers must separately establish persisted server ownership. */
export function validateOpenHandsMemorySnapshot(raw: unknown): OpenHandsMemoryContextSnapshot | null {
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const s = parsed.data;
  const binding = { ...s, namespaceScope: "project" as const };
  if (!isValidBinding(binding, s.workspaceId, s.projectId) || s.contentChars !== s.content.length) return null;
  try {
    const pack = JSON.parse(s.content);
    const validated = validateContextPack(JSON.stringify({
      graphContext: { ...pack, namespace: s.namespace, tenant: s.namespace }, provenance: pack.provenance,
    }), binding, Date.parse(s.retrievedAtIso));
    if (!validated || JSON.stringify(validated) !== s.content) return null;
  } catch { return null; }
  const hashInput = { contractVersion: s.contractVersion, sourceTool: s.sourceTool,
    workspaceId: s.workspaceId, projectId: s.projectId, namespace: s.namespace,
    centerEntityId: s.centerEntityId, retrievedAtIso: s.retrievedAtIso,
    content: s.content, redactionsApplied: s.redactionsApplied };
  if (createHash("sha256").update(JSON.stringify(hashInput)).digest("hex") !== s.snapshotHash) return null;
  return Object.freeze(s);
}

export type OpenHandsMemoryContextResult =
  | { status: "ready"; snapshot: OpenHandsMemoryContextSnapshot }
  | {
      status: "unavailable";
      reason:
        | "project_binding_missing"
        | "project_binding_invalid"
        | "memex_handshake_failed"
        | "memex_read_failed"
        | "context_pack_invalid"
        | "context_pack_unbounded";
    };

export type OpenHandsProjectMemoryContextInput = {
  /** Authenticated server workspace and persisted project identifiers; never request-body values. */
  workspaceId: string;
  projectId: string;
  resolveProjectBinding: (
    workspaceId: string,
    projectId: string,
  ) => Promise<OpenHandsProjectMemoryBinding | null>;
  /** Existing read-only MCP transport, already bound to the configured Memex service. */
  transport: MemexMcpTransport;
  now?: () => Date;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 160;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validAtRetrieval(record: JsonRecord, retrievedAtMs: number): boolean {
  if (record.validFrom != null && (!isTimestamp(record.validFrom) || Date.parse(record.validFrom) > retrievedAtMs)) {
    return false;
  }
  if (record.validTo != null && (!isTimestamp(record.validTo) || Date.parse(record.validTo) <= retrievedAtMs)) {
    return false;
  }
  return true;
}

function validProvenance(record: JsonRecord, provenance: readonly unknown[]): boolean {
  if (!isBoundedId(record.id) || typeof record.source !== "string" || !record.source.trim()) return false;
  return provenance.some(
    (entry) => isRecord(entry) && entry.id === record.id && entry.source === record.source,
  );
}

function validateContextPack(
  raw: string,
  binding: OpenHandsProjectMemoryBinding,
  retrievedAtMs: number,
): JsonRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.graphContext)) return null;

  const context = value.graphContext;
  if (context.namespace !== binding.namespace || context.tenant !== binding.namespace) return null;
  if (!isRecord(context.centerEntity) || context.centerEntity.id !== binding.centerEntityId) return null;
  if (context.centerEntity.namespace !== binding.namespace) return null;
  if (!Array.isArray(context.entities) || context.entities.length < 1 || context.entities.length > MAX_CONTEXT_ENTITIES) return null;
  if (!Array.isArray(context.relations) || context.relations.length > MAX_CONTEXT_RELATIONS) return null;
  if (!Array.isArray(value.provenance)) return null;

  const entities = context.entities as unknown[];
  const relations = context.relations as unknown[];
  const provenance = value.provenance as unknown[];
  const entityIds = new Set<string>();
  const recordIds = new Set<string>();
  let hasCenter = false;

  for (const item of entities) {
    if (!isRecord(item) || !isBoundedId(item.id) || entityIds.has(item.id)) return null;
    if (item.namespace !== binding.namespace || typeof item.type !== "string" || !item.type.trim()) return null;
    if (!isRecord(item.properties) || !["active", "verified"].includes(String(item.properties.status))) return null;
    if (item.properties.projectId !== undefined && item.properties.projectId !== binding.projectId) return null;
    if (!validAtRetrieval(item, retrievedAtMs) || !validProvenance(item, provenance)) return null;
    entityIds.add(item.id);
    recordIds.add(item.id);
    if (item.id === binding.centerEntityId) hasCenter = true;
  }
  if (!hasCenter) return null;

  for (const relation of relations) {
    if (!isRecord(relation) || !isBoundedId(relation.id) || typeof relation.type !== "string" || !relation.type.trim()) return null;
    if (recordIds.has(relation.id)) return null;
    if (relation.namespace !== binding.namespace || !entityIds.has(String(relation.sourceId)) || !entityIds.has(String(relation.targetId))) return null;
    if (relation.properties !== undefined && !isRecord(relation.properties)) return null;
    if (isRecord(relation.properties) && relation.properties.projectId !== undefined && relation.properties.projectId !== binding.projectId) return null;
    if (!validAtRetrieval(relation, retrievedAtMs) || !validProvenance(relation, provenance)) return null;
    recordIds.add(relation.id);
  }

  const selectedProvenance = [...entities, ...relations].map((item) => {
    const record = item as JsonRecord;
    const entry = provenance.find(
      (candidate) => isRecord(candidate) && candidate.id === record.id && candidate.source === record.source,
    ) as JsonRecord;
    return {
      id: entry.id,
      source: entry.source,
      originId: typeof entry.originId === "string" ? entry.originId : null,
      confidence: typeof entry.confidence === "number" ? entry.confidence : null,
    };
  });
  const centerEntity = entities.find((item) => isRecord(item) && item.id === binding.centerEntityId);
  if (!centerEntity || !isDeepStrictEqual(context.centerEntity, centerEntity)) return null;

  return { centerEntity, entities, relations, provenance: selectedProvenance };
}

function isValidBinding(
  binding: OpenHandsProjectMemoryBinding,
  workspaceId: string,
  projectId: string,
): boolean {
  return binding.workspaceId === workspaceId &&
    binding.projectId === projectId &&
    binding.namespaceScope === "project" &&
    isValidMemexNamespace(binding.namespace) &&
    binding.namespace.startsWith("org:") &&
    binding.namespace !== workspaceIdToMemexNamespace(workspaceId) &&
    isBoundedId(binding.centerEntityId);
}

/**
 * Reads one project-centered Memex graph pack for a future OpenHands dossier.
 * Project identity and namespace must come from an authenticated server resolver;
 * this helper never falls back to workspace-wide/latest memory or any Vault tool.
 */
export async function prepareOpenHandsMemoryContext(
  input: OpenHandsProjectMemoryContextInput,
): Promise<OpenHandsMemoryContextResult> {
  let binding: OpenHandsProjectMemoryBinding | null;
  try {
    binding = await input.resolveProjectBinding(input.workspaceId, input.projectId);
  } catch {
    return { status: "unavailable", reason: "project_binding_missing" };
  }
  if (!binding) return { status: "unavailable", reason: "project_binding_missing" };
  if (!isValidBinding(binding, input.workspaceId, input.projectId)) {
    return { status: "unavailable", reason: "project_binding_invalid" };
  }

  const policy = {
    ...defaultMemexBridgePolicy(binding.namespace),
    toolAllowlist: ["agentmemory_context_pack"] as const,
    maxContextChars: OPENHANDS_MEMORY_CONTEXT_MAX_CHARS,
  };
  const handshake = await runMemexHandshake(input.transport, policy);
  if (!handshake.ok || !handshake.allowedTools.includes("agentmemory_context_pack")) {
    return { status: "unavailable", reason: "memex_handshake_failed" };
  }

  const read = await callMemexReadTool(
    input.transport,
    "agentmemory_context_pack",
    {
      namespace: binding.namespace,
      centerEntityId: binding.centerEntityId,
      maxEntities: MAX_CONTEXT_ENTITIES,
      maxRelations: MAX_CONTEXT_RELATIONS,
      format: "json",
    },
    policy,
  );
  if (!read.ok) return { status: "unavailable", reason: "memex_read_failed" };

  const now = input.now?.() ?? new Date();
  const retrievedAtIso = now.toISOString();
  const pack = validateContextPack(read.text, binding, now.getTime());
  if (!pack) return { status: "unavailable", reason: "context_pack_invalid" };

  const content = JSON.stringify(pack);
  if (content.length > OPENHANDS_MEMORY_CONTEXT_MAX_CHARS) {
    return { status: "unavailable", reason: "context_pack_unbounded" };
  }

  const hashInput = JSON.stringify({
    contractVersion: 1,
    sourceTool: "agentmemory_context_pack",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    namespace: binding.namespace,
    centerEntityId: binding.centerEntityId,
    retrievedAtIso,
    content,
    redactionsApplied: read.redactionsApplied,
  });
  const snapshot: OpenHandsMemoryContextSnapshot = Object.freeze({
    contractVersion: 1,
    sourceTool: "agentmemory_context_pack",
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    namespace: binding.namespace,
    centerEntityId: binding.centerEntityId,
    retrievedAtIso,
    content,
    contentChars: content.length,
    redactionsApplied: read.redactionsApplied,
    snapshotHash: createHash("sha256").update(hashInput).digest("hex"),
  });
  return { status: "ready", snapshot };
}
