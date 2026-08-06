import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { readCronbeat } from "@/server/ventures/shadow-cronbeat";

/**
 * GET /api/health/shadow-cronbeat
 *
 * Read-only health probe over shadow mode's trigger. It watches the cron; the
 * cron does the work.
 *
 * Owner-gated like every other private surface here. It exposes no venture data
 * and no proposal content — only when the trigger last ran and how that reads
 * against the thresholds.
 *
 * Always HTTP 200, including when the verdict is `dead`. The status code answers
 * "did the probe respond", the body answers "is the cron alive". Folding the
 * second into the first would make a working probe look broken and invite
 * retries against a system that is answering correctly.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const ctx = getActiveWorkspaceContext();
  const reading = await readCronbeat(ctx);

  return NextResponse.json({
    probe: "shadow-cronbeat",
    workspaceId: ctx.workspace.id,
    ...reading,
  });
}
