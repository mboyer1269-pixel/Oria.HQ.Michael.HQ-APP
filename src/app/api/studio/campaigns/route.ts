import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { listReviewableStudioCampaigns } from "@/server/studio/studio-campaign-store";

// GET /api/studio/campaigns — CEO review queue (reviewable statuses only).
// In-memory store — not durable. Publish stays manual.

export async function GET() {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();
  const campaigns = listReviewableStudioCampaigns(ctx.workspace.id);

  return NextResponse.json({
    campaigns,
    publishAuthorized: false,
    persistence: "in_memory",
    note: "Reviewable prepared campaigns only (in-memory). Publish stays manual.",
  });
}
