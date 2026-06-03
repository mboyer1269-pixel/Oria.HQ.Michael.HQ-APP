/**
 * AgentOutcome repository -- dual-mode persistence (Supabase + local fallback).
 *
 * Same pattern as prepared-action-repository.ts:
 *   - Supabase (production): writes to public.agent_outcomes via service-role.
 *   - Local fallback (dev/test): in-memory store, never throws.
 *   - Production without Supabase: throws rather than silently dropping data.
 *
 * Scope: every read/write is scoped by workspace_id.
 * Safety: no_execution_authorized is enforced on every insert.
 * Append-only for outcome records; updates only change outcome/revenue/notes.
 */

import type {
  AgentOutcome,
  AgentOutcomeStatus,
  CreateAgentOutcomeInput,
  UpdateAgentOutcomeInput,
} from "@/features/ventures/agent-outcome";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { logger } from "@/lib/logger";

const PRODUCTION_GUARD =
  "Agent outcome persistence unavailable: Supabase not configured and " +
  "local fallback is only available outside production.";

// In-memory store for dev/test
const localOutcomes: AgentOutcome[] = [];
let localSeq = 0;

function getSupabaseClient() {
  return createOptionalSupabaseAdminClient();
}

function assertLocalFallback(): void {
  if (!isLocalPersistenceFallbackAllowed()) {
    throw new Error(PRODUCTION_GUARD);
  }
}

function makeLocalId(): string {
  localSeq += 1;
  return `local-ao-${String(localSeq).padStart(6, "0")}`;
}

export class AgentOutcomeRepositoryError extends Error {
  constructor(operation: "list" | "create" | "update") {
    super(`Agent outcome repository ${operation} failed.`);
    this.name = "AgentOutcomeRepositoryError";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new agent outcome record. Scoped to workspace_id.
 * Defaults outcome to "pending" and revenueCad to 0.
 */
export async function createAgentOutcome(
  input: CreateAgentOutcomeInput,
): Promise<AgentOutcome> {
  const now = new Date().toISOString();
  const outcome: AgentOutcome = {
    id: makeLocalId(),
    workspaceId: input.workspaceId,
    createdByUserId: input.createdByUserId,
    agentId: input.agentId,
    skillId: input.skillId,
    ventureId: input.ventureId,
    actionRef: input.actionRef,
    proposedAt: input.proposedAt ?? now,
    executedAt: input.executedAt,
    outcome: input.outcome ?? "pending",
    revenueCad: input.revenueCad ?? 0,
    notes: input.notes,
    noExecutionAuthorized: true,
    createdAt: now,
  };

  const db = getSupabaseClient();
  if (!db) {
    assertLocalFallback();
    localOutcomes.push({ ...outcome });
    return { ...outcome };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error, data } = await (db as any)
    .from("agent_outcomes")
    .insert({
      workspace_id: outcome.workspaceId,
      created_by_user_id: outcome.createdByUserId,
      agent_id: outcome.agentId,
      skill_id: outcome.skillId,
      venture_id: outcome.ventureId ?? null,
      action_ref: outcome.actionRef ?? null,
      proposed_at: outcome.proposedAt,
      executed_at: outcome.executedAt ?? null,
      outcome: outcome.outcome,
      revenue_cad: outcome.revenueCad,
      notes: outcome.notes ?? null,
      no_execution_authorized: true,
    })
    .select("id")
    .single();

  if (error) {
    logger.error("agent-outcome.repository.create.failed", { reason: error.message });
    throw new AgentOutcomeRepositoryError("create");
  }

  return { ...outcome, id: data?.id ?? outcome.id };
}

/**
 * List all outcomes for a workspace, most-recent first.
 * Optionally filter by agentId and/or skillId.
 */
export async function listAgentOutcomes(
  workspaceId: string,
  filter?: { agentId?: string; skillId?: string; ventureId?: string },
): Promise<AgentOutcome[]> {
  const db = getSupabaseClient();
  if (!db) {
    assertLocalFallback();
    return localOutcomes
      .filter((o) => {
        if (o.workspaceId !== workspaceId) return false;
        if (filter?.agentId && o.agentId !== filter.agentId) return false;
        if (filter?.skillId && o.skillId !== filter.skillId) return false;
        if (filter?.ventureId && o.ventureId !== filter.ventureId) return false;
        return true;
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((o) => ({ ...o }));
  }

  let query = db
    .from("agent_outcomes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (filter?.agentId) query = query.eq("agent_id", filter.agentId);
  if (filter?.skillId) query = query.eq("skill_id", filter.skillId);
  if (filter?.ventureId) query = query.eq("venture_id", filter.ventureId);

  const { data, error } = await query;
  if (error) {
    logger.error("agent-outcome.repository.list.failed", { reason: error.message });
    throw new AgentOutcomeRepositoryError("list");
  }

  return (data ?? []).map(mapRowToOutcome);
}

/**
 * Update an existing outcome (CEO evaluates the result).
 * Only outcome, revenueCad, notes, and executedAt can be updated.
 */
export async function updateAgentOutcome(
  input: UpdateAgentOutcomeInput,
): Promise<void> {
  const db = getSupabaseClient();
  if (!db) {
    assertLocalFallback();
    const idx = localOutcomes.findIndex((o) => o.id === input.id);
    if (idx !== -1) {
      localOutcomes[idx] = {
        ...localOutcomes[idx],
        outcome: input.outcome,
        revenueCad: input.revenueCad ?? localOutcomes[idx].revenueCad,
        notes: input.notes ?? localOutcomes[idx].notes,
        executedAt: input.executedAt ?? localOutcomes[idx].executedAt,
      };
    }
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("agent_outcomes")
    .update({
      outcome: input.outcome,
      ...(input.revenueCad !== undefined && { revenue_cad: input.revenueCad }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.executedAt !== undefined && { executed_at: input.executedAt }),
    })
    .eq("id", input.id);

  if (error) {
    logger.error("agent-outcome.repository.update.failed", { reason: error.message });
    throw new AgentOutcomeRepositoryError("update");
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRowToOutcome(row: Record<string, unknown>): AgentOutcome {
  return {
    id: String(row["id"] ?? ""),
    workspaceId: String(row["workspace_id"] ?? ""),
    createdByUserId: String(row["created_by_user_id"] ?? ""),
    agentId: String(row["agent_id"] ?? ""),
    skillId: String(row["skill_id"] ?? ""),
    ventureId: row["venture_id"] ? String(row["venture_id"]) : undefined,
    actionRef: row["action_ref"] ? String(row["action_ref"]) : undefined,
    proposedAt: String(row["proposed_at"] ?? ""),
    executedAt: row["executed_at"] ? String(row["executed_at"]) : undefined,
    outcome: (row["outcome"] as AgentOutcomeStatus) ?? "pending",
    revenueCad: Number(row["revenue_cad"] ?? 0),
    notes: row["notes"] ? String(row["notes"]) : undefined,
    noExecutionAuthorized: true,
    createdAt: String(row["created_at"] ?? ""),
  };
}

/** Test helper: clear the in-memory store. */
export function __clearAgentOutcomesForTests(): void {
  localOutcomes.length = 0;
  localSeq = 0;
}
