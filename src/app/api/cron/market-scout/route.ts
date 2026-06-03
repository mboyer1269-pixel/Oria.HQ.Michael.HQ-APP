import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";

/**
 * GET /api/cron/market-scout
 *
 * Placeholder for the scheduled market-scout signal collection cron job.
 *
 * STATUS: Not yet implemented — returns 501.
 *
 * Future implementation will:
 *   1. Verify auth via requireOwnerApiSession (or a cron secret header).
 *   2. Run the market-scout agent to collect venture signals.
 *   3. Write cash-signal intakes to the prepared-actions queue (append-only).
 *
 * SAFETY: This route must NEVER auto-send, contact, or dispatch anything.
 *   It is a read/enqueue-only operation. All enqueued signals require
 *   CEO review before any manual action is taken.
 */
export async function GET() {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  return NextResponse.json(
    {
      error: "Not implemented.",
      route: "cron/market-scout",
      status: "stub — not yet active",
    },
    { status: 501 },
  );
}
