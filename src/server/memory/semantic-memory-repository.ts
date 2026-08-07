import "server-only";

import { resolveContextPartition } from "@/core/context-partition";
import type { ContextPartition } from "@/core/context-partition";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { AgentSemanticMemoryEmbeddingInsert, AgentSemanticMemoryEmbeddingRow, Json } from "@/server/db/types";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import {
  SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
  type SemanticMemoryEmbedding,
  type SemanticMemoryQuery,
  type SemanticMemoryQueryResult,
  type SemanticMemoryUpsertInput,
} from "./semantic-memory-types";

const PRODUCTION_GUARD_MESSAGE =
  "Semantic memory persistence is unavailable: Supabase is not configured " +
  "and local-fallback persistence is only available outside production.";

const localEmbeddings: SemanticMemoryEmbedding[] = [];
let localSeq = 0;

export class SemanticMemoryRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticMemoryRepositoryError";
  }
}

function getSupabaseClient() {
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallbackAvailable(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD_MESSAGE);
  }
}

function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS) {
    throw new SemanticMemoryRepositoryError(
      `Embedding must have exactly ${SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }
}

function mapRowToEmbedding(row: AgentSemanticMemoryEmbeddingRow): SemanticMemoryEmbedding {
  const embedding = Array.isArray(row.embedding)
    ? row.embedding.map((value) => Number(value))
    : [];

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    modeId: row.mode_id,
    contextPartition: row.context_partition as ContextPartition,
    memoryId: row.memory_id,
    contentHash: row.content_hash,
    contentPreview: row.content_preview,
    embedding,
    dimensions: row.dimensions,
    trustLevel: row.trust_level as SemanticMemoryEmbedding["trustLevel"],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInputToInsert(input: SemanticMemoryUpsertInput): AgentSemanticMemoryEmbeddingInsert {
  const contextPartition = resolveContextPartition(input.modeId);
  const now = new Date().toISOString();

  return {
    workspace_id: input.workspaceId,
    mode_id: input.modeId,
    context_partition: contextPartition,
    memory_id: input.memoryId,
    content_hash: input.contentHash,
    content_preview: input.contentPreview.slice(0, 500),
    embedding: [...input.embedding],
    dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
    trust_level: input.trustLevel ?? "verified",
    metadata: (input.metadata ?? {}) as Json,
    updated_at: now,
  };
}

/**
 * Upserts a semantic memory embedding scoped to workspace + context partition.
 * Cross-partition contamination is rejected at the DB layer (migration 0030).
 */
export async function upsertSemanticMemoryEmbedding(
  input: SemanticMemoryUpsertInput,
): Promise<SemanticMemoryEmbedding> {
  assertEmbeddingDimensions(input.embedding);

  const insert = mapInputToInsert(input);
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const existingIndex = localEmbeddings.findIndex(
      (entry) =>
        entry.workspaceId === input.workspaceId &&
        entry.contextPartition === insert.context_partition &&
        entry.memoryId === input.memoryId,
    );

    const next: SemanticMemoryEmbedding = {
      id:
        existingIndex >= 0
          ? localEmbeddings[existingIndex].id
          : `local-semantic-${String((localSeq += 1)).padStart(6, "0")}`,
      workspaceId: input.workspaceId,
      modeId: input.modeId,
      contextPartition: insert.context_partition as ContextPartition,
      memoryId: input.memoryId,
      contentHash: input.contentHash,
      contentPreview: insert.content_preview,
      embedding: [...input.embedding],
      dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
      trustLevel: insert.trust_level as SemanticMemoryEmbedding["trustLevel"],
      metadata: (insert.metadata ?? {}) as Record<string, unknown>,
      createdAt: existingIndex >= 0 ? localEmbeddings[existingIndex].createdAt : insert.updated_at!,
      updatedAt: insert.updated_at!,
    };

    if (existingIndex >= 0) {
      localEmbeddings[existingIndex] = next;
    } else {
      localEmbeddings.push(next);
    }

    return structuredClone(next);
  }

  const { data, error } = await db
    .from("agent_semantic_memory_embeddings")
    .upsert(insert, { onConflict: "workspace_id,context_partition,memory_id" })
    .select()
    .single();

  if (error || !data) {
    throw new SemanticMemoryRepositoryError("Failed to upsert semantic memory embedding.");
  }

  return mapRowToEmbedding(data);
}

/**
 * Lists semantic memories for a workspace partition. Never crosses Vie/Travail.
 */
export async function listSemanticMemoryEmbeddings(
  query: SemanticMemoryQuery,
): Promise<SemanticMemoryQueryResult> {
  const limit = query.limit ?? 20;
  const db = getSupabaseClient();

  if (!db) {
    assertLocalFallbackAvailable();
    const entries = localEmbeddings
      .filter(
        (entry) =>
          entry.workspaceId === query.workspaceId &&
          entry.contextPartition === query.contextPartition &&
          (query.modeId ? entry.modeId === query.modeId : true) &&
          (query.trustLevel ? entry.trustLevel === query.trustLevel : true),
      )
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, limit)
      .map((entry) => structuredClone(entry));

    return {
      entries,
      workspaceId: query.workspaceId,
      contextPartition: query.contextPartition,
      retrievedAt: new Date().toISOString(),
    };
  }

  let builder = db
    .from("agent_semantic_memory_embeddings")
    .select("*")
    .eq("workspace_id", query.workspaceId)
    .eq("context_partition", query.contextPartition)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (query.modeId) {
    builder = builder.eq("mode_id", query.modeId);
  }
  if (query.trustLevel) {
    builder = builder.eq("trust_level", query.trustLevel);
  }

  const { data, error } = await builder;
  if (error) {
    throw new SemanticMemoryRepositoryError("Failed to list semantic memory embeddings.");
  }

  return {
    entries: (data ?? []).map(mapRowToEmbedding),
    workspaceId: query.workspaceId,
    contextPartition: query.contextPartition,
    retrievedAt: new Date().toISOString(),
  };
}

/** Test-only helper to clear the in-memory fallback store. */
export function __clearSemanticMemoryEmbeddingsForTests(): void {
  localEmbeddings.length = 0;
  localSeq = 0;
}
