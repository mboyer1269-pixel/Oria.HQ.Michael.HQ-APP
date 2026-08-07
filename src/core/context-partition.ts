/**
 * Vie / Travail context partition model.
 *
 * personal = Vie personnelle; all other workspace modes map to Travail.
 * Mirrors public.resolve_context_partition() in migration 0028.
 */

export type ContextPartition = "personal" | "work";

export const CONTEXT_PARTITIONS: readonly ContextPartition[] = ["personal", "work"];

const PERSONAL_MODE_ID = "personal";

export function resolveContextPartition(modeId: string): ContextPartition {
  return modeId === PERSONAL_MODE_ID ? "personal" : "work";
}

export function isContextPartition(value: unknown): value is ContextPartition {
  return value === "personal" || value === "work";
}
