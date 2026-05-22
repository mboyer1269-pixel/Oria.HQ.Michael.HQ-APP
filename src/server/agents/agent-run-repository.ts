import "server-only";
import { randomUUID } from "crypto";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { isLocalPersistenceFallbackAllowed } from "@/lib/server-env";
import type { AgentRunInsert, AgentRunRow, SignalBriefInsert, SignalBriefRow } from "@/server/db/types";
import type { SignalBriefDraft } from "@/server/briefing/briefing-service";
import type { ScanResult } from "@/server/market-scout/scanner";

// In-memory fallback for local development
const localRuns: AgentRunRow[] = [];
const localBriefs: SignalBriefRow[] = [];

export type AgentRunStorageMode = "supabase" | "local";

export type SaveRunResult = {
  runId: string;
  briefId: string | null;
  storageMode: AgentRunStorageMode;
};

export async function saveAgentRun(opts: {
  workspaceId: string;
  agentId: string;
  trigger: AgentRunInsert["trigger"];
  scan: ScanResult;
  brief: SignalBriefDraft | null;
  error?: string;
}): Promise<SaveRunResult> {
  const supabase = createOptionalSupabaseAdminClient();
  const runId = randomUUID();
  const briefId = opts.brief ? randomUUID() : null;
  const now = new Date().toISOString();

  const runInsert: AgentRunInsert = {
    id: runId,
    workspace_id: opts.workspaceId,
    agent_id: opts.agentId,
    status: opts.error ? "failed" : "done",
    trigger: opts.trigger,
    signals_count: opts.scan.signals.length,
    summary: opts.brief?.executiveSummary ?? null,
    error: opts.error ?? null,
    started_at: now,
    completed_at: now,
  };

  if (supabase) {
    const { error: runError } = await supabase.from("agent_runs").insert(runInsert);

    if (runError) {
      console.error("[agent-run-repository] Failed to save run:", runError.message);
    }

    if (opts.brief && briefId && !runError) {
      const briefInsert: SignalBriefInsert = {
        id: briefId,
        workspace_id: opts.workspaceId,
        agent_run_id: runId,
        title: opts.brief.title,
        content: JSON.stringify(opts.brief),
        signals_raw: opts.scan.signals as unknown as import("@/server/db/types").Json,
        status: "draft",
      };

      const { error: briefError } = await supabase.from("signal_briefs").insert(briefInsert);

      if (briefError) {
        console.error("[agent-run-repository] Failed to save brief:", briefError.message);
      }
    }

    return { runId, briefId, storageMode: "supabase" };
  }

  if (isLocalPersistenceFallbackAllowed()) {
    const runRow: AgentRunRow = { ...runInsert, id: runId, started_at: now };
    localRuns.push(runRow);

    if (opts.brief && briefId) {
      const briefRow: SignalBriefRow = {
        id: briefId,
        workspace_id: opts.workspaceId,
        agent_run_id: runId,
        title: opts.brief.title,
        content: JSON.stringify(opts.brief),
        signals_raw: opts.scan.signals as unknown as import("@/server/db/types").Json,
        status: "draft",
        created_at: now,
      };
      localBriefs.push(briefRow);
    }

    return { runId, briefId, storageMode: "local" };
  }

  throw new Error("No storage available: Supabase is not configured and local fallback is disabled in production.");
}

export async function listRecentRuns(workspaceId: string, limit = 10): Promise<AgentRunRow[]> {
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("started_at", { ascending: false })
      .limit(limit);

    return data ?? [];
  }

  return localRuns
    .filter((r) => r.workspace_id === workspaceId)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, limit);
}

export async function listRecentBriefs(workspaceId: string, limit = 5): Promise<SignalBriefRow[]> {
  const supabase = createOptionalSupabaseAdminClient();

  if (supabase) {
    const { data } = await supabase
      .from("signal_briefs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(limit);

    return data ?? [];
  }

  return localBriefs
    .filter((b) => b.workspace_id === workspaceId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}
