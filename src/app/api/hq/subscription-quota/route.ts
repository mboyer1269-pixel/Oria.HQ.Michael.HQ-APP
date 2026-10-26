import { NextResponse } from "next/server";
import { requireWorkspaceApiSession } from "@/server/auth/owner";
import { subscriptionQuotaResponse } from "./handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** GET /api/hq/subscription-quota — remaining Claude Code / Codex subscription usage from local logs (owner only). */
export async function GET(request: Request) {
  const session = await requireWorkspaceApiSession(request);
  if (session instanceof NextResponse) return session;
  return subscriptionQuotaResponse({ userId: session.ctx.userId, role: session.ctx.role });
}
