import { NextRequest, NextResponse } from "next/server";
import { runMarketScan } from "@/server/market-scout/scanner";
import { generateSignalBrief } from "@/server/briefing/briefing-service";
import { saveAgentRun } from "@/server/agents/agent-run-repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  let scan;
  let brief = null;
  let runError: string | undefined;

  try {
    scan = await runMarketScan(workspaceId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Scanner failed";
    return NextResponse.json({ error: msg, step: "scan" }, { status: 500 });
  }

  try {
    brief = await generateSignalBrief(scan);
  } catch (err) {
    runError = err instanceof Error ? err.message : "Briefing generation failed";
  }

  const { runId, briefId, storageMode } = await saveAgentRun({
    workspaceId,
    agentId: "market-scout",
    trigger: "cron",
    scan,
    brief,
    error: runError,
  });

  return NextResponse.json({
    ok: true,
    runId,
    briefId,
    storageMode,
    signalsCollected: scan.signals.length,
    briefGenerated: Boolean(brief),
    marketTensionScore: brief?.marketTensionScore ?? null,
    briefTitle: brief?.title ?? null,
    error: runError ?? null,
  });
}
