import type { ContextPartition } from "@/core/context-partition";

export type SemanticMemoryTrustLevel = "verified" | "proposed" | "draft";

export const SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS = 1536;

export type SemanticMemoryEmbedding = {
  id: string;
  workspaceId: string;
  modeId: string;
  contextPartition: ContextPartition;
  memoryId: string;
  contentHash: string;
  contentPreview: string;
  embedding: readonly number[];
  dimensions: number;
  trustLevel: SemanticMemoryTrustLevel;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SemanticMemoryUpsertInput = {
  workspaceId: string;
  modeId: string;
  memoryId: string;
  contentHash: string;
  contentPreview: string;
  embedding: readonly number[];
  trustLevel?: SemanticMemoryTrustLevel;
  metadata?: Record<string, unknown>;
};

export type SemanticMemoryQuery = {
  workspaceId: string;
  contextPartition: ContextPartition;
  modeId?: string;
  trustLevel?: SemanticMemoryTrustLevel;
  limit?: number;
};

export type SemanticMemoryQueryResult = {
  entries: SemanticMemoryEmbedding[];
  workspaceId: string;
  contextPartition: ContextPartition;
  retrievedAt: string;
};
