import "server-only";
import { z } from "zod";
import type { Mission } from "@/core/types";
import type { MemexMcpTransport } from "@/server/mcp/memex-readonly-client";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/server/db/types";
import { mapMissionRow } from "./mission-row";
import { buildOpenHandsSubmission, openHandsSubmissionRequestSchema, OPENHANDS_MEMORY_KEY } from "./openhands-submission";
import { prepareOpenHandsMemoryContext, validateOpenHandsMemorySnapshot,
  type OpenHandsMemoryContextSnapshot, type OpenHandsProjectMemoryBinding } from "./openhands-memory-context";
import type { OpenHandsMemorySnapshotStore } from "./openhands-memory-snapshot-store";

export const openHandsMemoryAttachmentSchema = openHandsSubmissionRequestSchema.extend({ projectId: z.string().trim().min(1).max(160) }).strict();
export type OpenHandsMemoryAttachmentStore = {
  load(workspaceId: string, missionId: string): Promise<Mission | null>;
  attach(mission: Mission, snapshot: OpenHandsMemoryContextSnapshot): Promise<Mission | null>;
};

export function createOpenHandsMemoryAttachmentStore(client = createOptionalSupabaseAdminClient()): OpenHandsMemoryAttachmentStore | null {
  if (!client) return null;
  return {
    async load(workspaceId, missionId) {
      const { data, error } = await client.from("missions").select().eq("id", missionId).eq("workspace_id", workspaceId).maybeSingle();
      if (error) throw Error("memory_mission_read_unavailable");
      return data ? mapMissionRow(data) : null;
    },
    async attach(mission, snapshot) {
      const priorTime = Date.parse(mission.updatedAt);
      if (!Number.isFinite(priorTime) || mission.status !== "draft" || OPENHANDS_MEMORY_KEY in mission.input) throw Error("memory_attachment_invalid");
      const updatedAt = new Date(Math.max(Date.now(), priorTime + 1)).toISOString();
      const { data, error } = await client.from("missions").update({
        input: { ...mission.input, [OPENHANDS_MEMORY_KEY]: snapshot } as unknown as Json, updated_at: updatedAt,
      }).eq("id", mission.id).eq("workspace_id", mission.workspaceId).eq("status", "draft")
        .eq("updated_at", mission.updatedAt).eq("input", JSON.stringify(mission.input)).select().maybeSingle();
      if (error) throw Error("memory_attachment_outcome_unknown");
      return data ? mapMissionRow(data) : null;
    },
  };
}

/** Authenticated owner boundary required. Project mapping is server-owned and
 * must remain immutable for a mission preparation; no namespace comes from input.
 * This step changes the mission version and must precede dossier confirmation.
 */
export function createOpenHandsMemoryAttachmentService(deps: {
  store: OpenHandsMemoryAttachmentStore;
  snapshots: OpenHandsMemorySnapshotStore;
  resolveProjectBinding(workspaceId: string, projectId: string): Promise<OpenHandsProjectMemoryBinding | null>;
  createTransport(binding: OpenHandsProjectMemoryBinding): Promise<MemexMcpTransport>;
}) {
  return async (context: { workspaceId: string; actorId: string }, raw: unknown) => {
    const result = (status: string) => ({ status, externalEffectAllowed: false as const });
    const parsed = openHandsMemoryAttachmentSchema.safeParse(raw);
    if (!parsed.success || !context.actorId.trim()) return result("invalid_request");
    const { projectId, ...request } = parsed.data;
    let attachAttempted = false;
    try {
      const mission = await deps.store.load(context.workspaceId, request.missionId);
      if (!mission || mission.workspaceId !== context.workspaceId || mission.id !== request.missionId) return result("not_found");
      const prepared = buildOpenHandsSubmission(mission, context.workspaceId, request);
      if (prepared.status !== "prepared") return result(prepared.status);
      const binding = await deps.resolveProjectBinding(context.workspaceId, projectId);
      if (!binding || binding.workspaceId !== context.workspaceId || binding.projectId !== projectId || binding.namespaceScope !== "project") return result("project_unbound");
      const matches = (s: OpenHandsMemoryContextSnapshot) => s.workspaceId === binding.workspaceId && s.projectId === binding.projectId
        && s.namespace === binding.namespace && s.centerEntityId === binding.centerEntityId;
      if (prepared.dossier.memory) return result(matches(prepared.dossier.memory) ? "already_attached" : "conflict");
      const scope = { ...context, projectId, missionId: mission.id, missionVersion: mission.updatedAt };
      let snapshot = await deps.snapshots.load(scope);
      if (!snapshot) {
        const transport = await deps.createTransport(binding);
        try {
          const capture = await prepareOpenHandsMemoryContext({ ...context, projectId,
            resolveProjectBinding: async () => binding, transport });
          if (capture.status !== "ready") return result("memory_unavailable");
          snapshot = await deps.snapshots.persist(scope, capture.snapshot);
        } finally { await transport.close(); }
      }
      const verified = validateOpenHandsMemorySnapshot(snapshot);
      if (!verified || !matches(verified)) return result("conflict");
      attachAttempted = true;
      const saved = await deps.store.attach(mission, verified);
      if (!saved) return result("conflict");
      const rebuilt = buildOpenHandsSubmission(saved, context.workspaceId, { ...request, expectedUpdatedAt: saved.updatedAt });
      if (rebuilt.status !== "prepared" || rebuilt.dossier.memory?.snapshotHash !== verified.snapshotHash
        || saved.updatedAt === mission.updatedAt) return result("attachment_outcome_unknown");
      return { ...result("attached"), missionId: saved.id, updatedAt: saved.updatedAt, snapshotHash: verified.snapshotHash };
    } catch { return result(attachAttempted ? "attachment_outcome_unknown" : "unavailable"); }
  };
}
