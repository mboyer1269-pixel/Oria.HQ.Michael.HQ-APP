import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { listStudioPreparedCampaigns } from "@/server/studio/studio-campaign-store";

// GET /api/studio/campaigns — list prepared Studio campaigns (CEO review queue).

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const campaigns = listStudioPreparedCampaigns(ctx.workspace.id);

  return NextResponse.json({
    campaigns,
    publishAuthorized: false,
    note: "Prepared campaigns only — publish stays manual.",
  });
}
