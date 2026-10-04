import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/server/db/types";
import { validateOpenHandsMemorySnapshot, type OpenHandsMemoryContextSnapshot } from "./openhands-memory-context";

const boundedId = z.string().trim().min(1).max(160);
const scopeSchema = z.object({ workspaceId: boundedId, projectId: boundedId, actorId: boundedId,
  missionId: z.uuid(), missionVersion: z.iso.datetime({ offset: true }) }).strict();
export type OpenHandsMemorySnapshotScope = z.infer<typeof scopeSchema>;
export type OpenHandsMemorySnapshotStore = {
  load(scope: OpenHandsMemorySnapshotScope): Promise<OpenHandsMemoryContextSnapshot | null>;
  /** First persisted snapshot wins; always returns the canonical stored value. */
  persist(scope: OpenHandsMemorySnapshotScope, snapshot: OpenHandsMemoryContextSnapshot): Promise<OpenHandsMemoryContextSnapshot>;
};

function identity(raw: OpenHandsMemorySnapshotScope) {
  const scope = scopeSchema.parse(raw);
  const bytes = createHash("sha256").update(JSON.stringify(["oria.openhands.memory.v1",
    scope.workspaceId, scope.projectId, scope.actorId, scope.missionId, scope.missionVersion])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return { scope, id: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` };
}

/** Server-only preparation storage. No authorization, memory refresh or local fallback.
 * The caller must resolve mission/project/owner before calling. A changed project
 * binding requires a new mission version, not replacement of an approved snapshot.
 */
export function createOpenHandsMemorySnapshotStore(client = createOptionalSupabaseAdminClient()): OpenHandsMemorySnapshotStore | null {
  if (!client) return null;
  const load: OpenHandsMemorySnapshotStore["load"] = async (raw) => {
    const { scope, id } = identity(raw);
    const { data, error } = await client.from("action_ledger").select().eq("id", id)
      .eq("workspace_id", scope.workspaceId).eq("user_id", scope.actorId).maybeSingle();
    if (error) throw Error("memory_snapshot_read_unavailable");
    if (!data) return null;
    const snapshot = validateOpenHandsMemorySnapshot(data.payload);
    if (data.id !== id || data.workspace_id !== scope.workspaceId || data.user_id !== scope.actorId
      || data.mission_id !== scope.missionId || data.action_type !== "mission.openhands_memory_snapshot"
      || data.event_type !== "result" || !isDeepStrictEqual(data.metadata, { version: 1, scope })
      || !snapshot || snapshot.workspaceId !== scope.workspaceId || snapshot.projectId !== scope.projectId) {
      throw Error("memory_snapshot_integrity_conflict");
    }
    return snapshot;
  };
  return { load, async persist(raw, proposed) {
    const { scope, id } = identity(raw);
    const snapshot = validateOpenHandsMemorySnapshot(proposed);
    if (!snapshot || snapshot.workspaceId !== scope.workspaceId || snapshot.projectId !== scope.projectId) {
      throw Error("memory_snapshot_scope_invalid");
    }
    const { error } = await client.from("action_ledger").upsert({ id, user_id: scope.actorId,
      workspace_id: scope.workspaceId, mission_id: scope.missionId,
      action_type: "mission.openhands_memory_snapshot", event_type: "result",
      summary: "Prepared project memory snapshot; no execution or approval", autonomy_level: 0,
      requires_confirmation: false, model_id: null, cost_mode: null, skill_id: null, agent_id: null,
      payload: snapshot as unknown as Json, metadata: { version: 1, scope } as unknown as Json,
    }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw Error("memory_snapshot_write_outcome_unknown");
    const canonical = await load(scope);
    if (!canonical) throw Error("memory_snapshot_write_outcome_unknown");
    return canonical;
  } };
}
