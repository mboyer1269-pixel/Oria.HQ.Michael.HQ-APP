import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AgentNameStore, NameRow } from "./service";

/** Session-bound client; no service-role bypass, in-memory fallback or browser storage. */
export async function createAgentNameStore(): Promise<AgentNameStore> {
  const db = await createServerSupabaseClient();
  return {
    async read(scope) {
      const { data, error } = await db.from("agent_display_names")
        .select("user_id,workspace_id,agent_id,display_name")
        .eq("user_id", scope.ownerId).eq("workspace_id", scope.workspaceId);
      if (error || !data) throw new Error("Name storage read unavailable");
      return data as NameRow[];
    },
    async write(scope, agentId, name) {
      if (name === null) {
        const { error } = await db.from("agent_display_names").delete()
          .eq("user_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("agent_id", agentId);
        if (error) throw new Error("Name storage reset unavailable");
        const remaining = await db.from("agent_display_names").select("agent_id")
          .eq("user_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("agent_id", agentId).maybeSingle();
        if (remaining.error || remaining.data) throw new Error("Name storage reset unconfirmed");
        return;
      }
      const row = { user_id: scope.ownerId, workspace_id: scope.workspaceId, agent_id: agentId, display_name: name };
      // Update only the name column: the session has no UPDATE privilege on IDs.
      const updated = await db.from("agent_display_names").update({ display_name: name })
        .eq("user_id", scope.ownerId).eq("workspace_id", scope.workspaceId).eq("agent_id", agentId)
        .select("user_id,workspace_id,agent_id,display_name").maybeSingle();
      const { data, error } = updated.data || updated.error ? updated
        : await db.from("agent_display_names").insert(row)
          .select("user_id,workspace_id,agent_id,display_name").single();
      if (error || !data || data.user_id !== scope.ownerId || data.workspace_id !== scope.workspaceId || data.agent_id !== agentId || data.display_name !== name) throw new Error("Name storage write unconfirmed");
    },
  };
}
