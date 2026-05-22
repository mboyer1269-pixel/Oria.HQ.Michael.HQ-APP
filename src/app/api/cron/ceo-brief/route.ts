import { NextRequest, NextResponse } from "next/server";
import { buildCeoBriefSnapshot } from "@/server/brief/ceo-brief-service";
import { listRecentBriefs } from "@/server/agents/agent-run-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";

  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspace") ?? "michael-hq";

  const [snapshot, recentBriefs] = await Promise.all([
    buildCeoBriefSnapshot(),
    listRecentBriefs(workspaceId, 1),
  ]);

  const latestBrief = recentBriefs[0] ?? null;

  return NextResponse.json({
    ok: true,
    generatedAt: snapshot.generatedAt,
    headline: snapshot.headline,
    focusLine: snapshot.focusLine,
    agenda: {
      upcomingCount: snapshot.agenda.upcomingCount,
    },
    leads: {
      newCount: snapshot.leads.newCount,
    },
    latestSignalBrief: latestBrief
      ? {
          id: latestBrief.id,
          title: latestBrief.title,
          status: latestBrief.status,
          createdAt: latestBrief.created_at,
        }
      : null,
  });
}
