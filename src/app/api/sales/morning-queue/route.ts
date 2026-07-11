import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildMorningQueue } from "@/features/sales/sales-lead";
import { listSalesLeads } from "@/server/sales/lead-bank-store";

// GET /api/sales/morning-queue — due follow-ups first, then score

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const leads = listSalesLeads(ctx.workspace.id);
  const queue = buildMorningQueue(leads, nowIso);

  return NextResponse.json({
    nowIso,
    queue,
    dueCount: queue.filter((q) => q.due).length,
    persistence: "in_memory",
    note: "Morning queue: due → score → nextFollowUpAt. Sold/lost excluded.",
  });
}
