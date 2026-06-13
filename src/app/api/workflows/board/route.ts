import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { listActionLedgerForWorkspace } from "@/server/actions/action-ledger-read";
import type { ActionLedgerEntry } from "@/server/actions/action-ledger-repository";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { selectWorkflowsModel } from "@/features/workflows/workflows-page-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/workflows/board
 * Owner-only. Returns the live workflows board derived from the action ledger
 * (real runs), falling back to the labelled demonstration board when there is
 * no live activity. Read-only — reads the ledger, triggers nothing, writes
 * nothing.
 */
export async function GET() {
  const denied = await requireOwnerApiSession();
  if (denied) return denied;

  let entries: ActionLedgerEntry[] = [];
  try {
    const { activeWorkspace } = getActiveWorkspaceContext();
    const ledger = await listActionLedgerForWorkspace({
      workspaceId: activeWorkspace.id,
      limit: 100,
    });
    entries = ledger.entries;
  } catch {
    entries = [];
  }

  const model = selectWorkflowsModel(entries, new Map());

  return NextResponse.json(
    { board: model.board, source: model.source, note: model.note },
    { status: 200 },
  );
}
