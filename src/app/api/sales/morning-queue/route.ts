import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { buildMorningQueue } from "@/features/sales/sales-lead";
import { buildLivreScoreContextMap } from "@/features/sales/livre-queue-context";
import { listSalesLeads } from "@/server/sales/lead-bank-store";
import { listAppointments } from "@/server/sales/appointment-book-store";

// GET /api/sales/morning-queue — due follow-ups first, then livre / score

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const nowIso = new Date().toISOString();
  const leads = listSalesLeads(ctx.workspace.id);
  const appointments = listAppointments(ctx.workspace.id);
  const livreByLeadId = buildLivreScoreContextMap(appointments, nowIso);
  const queue = buildMorningQueue(leads, nowIso, { livreByLeadId });

  return NextResponse.json({
    nowIso,
    queue,
    dueCount: queue.filter((q) => q.due).length,
    todayApptCount: queue.filter((q) => q.livreHint === "today_appt").length,
    needsSlotCount: queue.filter((q) => q.livreHint === "needs_slot").length,
    persistence: "in_memory",
    note: "Morning queue: essais du jour → due → score (livre-aware). Sold/lost excluded.",
  });
}
