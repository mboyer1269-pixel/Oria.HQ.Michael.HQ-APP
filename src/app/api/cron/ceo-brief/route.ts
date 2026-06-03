import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";

/**
 * GET /api/cron/ceo-brief
 *
 * Placeholder for the scheduled CEO brief generation cron job.
 *
 * STATUS: Not yet implemented — returns 501.
 *
 * Future implementation will:
 *   1. Verify auth via requireOwnerApiSession (or a cron secret header).
 *   2. Call buildCeoBriefSnapshot() and persist the result.
 *   3. Optionally notify via Resend.
 *
 * SAFETY: This route must NEVER auto-execute agentic actions without
 * explicit workspace-scoped authorization. It is read/generate only.
 */
export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  return NextResponse.json(
    {
      error: "Not implemented.",
      route: "cron/ceo-brief",
      status: "stub — not yet active",
    },
    { status: 501 },
  );
}
