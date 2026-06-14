import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import { listMissionsForWorkspace } from "@/server/missions";
import { buildMissionLookup, type MissionLookup } from "@/features/hq/ledger-activity";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { selectWorkflowsModel } from "@/features/workflows/workflows-page-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflows/board
 * Owner-only. Returns the live workflows board derived from the action ledger
 * (real runs) with run titles/status from missions and staleness against the
 * server clock. Falls back to the labelled demonstration board when there is no
 * live activity. Read-only — reads the ledger/missions, triggers nothing.
 */
export async function GET() {
  const denied = await requireOwnerApiSession();
  if (denied) return denied;

  let entries: ActionLedgerEntry[] = [];
  let missionLookup: MissionLookup = new Map();
  try {
    const { activeWorkspace, activeMode } = getActiveWorkspaceContext();
    const [ledger, missions] = await Promise.all([
      listActionLedgerForWorkspace({ workspaceId: activeWorkspace.id, limit: 100 }),
      listMissionsForWorkspace({ workspaceId: activeWorkspace.id, modeId: activeMode.id }),
    ]);
    entries = ledger.entries;
    missionLookup = buildMissionLookup(missions.missions);
  } catch {
    entries = [];
    missionLookup = new Map();
  }

  const model = selectWorkflowsModel(entries, missionLookup, Date.now());

  return NextResponse.json(
    { board: model.board, source: model.source, note: model.note },
    { status: 200 },
  );
}
