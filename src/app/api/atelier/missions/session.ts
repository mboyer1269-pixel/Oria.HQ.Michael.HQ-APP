import { NextResponse } from "next/server";
import { requireWorkspaceApiSession } from "@/server/auth/owner";
import type { AtelierCtx } from "./handlers";

/** B1 boundary (PR #410): authenticated identity + explicit/legacy workspace (x-oria-workspace header or ?workspace=). */
export async function atelierSession(request: Request): Promise<AtelierCtx | NextResponse> {
  const session = await requireWorkspaceApiSession(request);
  if (session instanceof NextResponse) return session;
  // Mutations launch CLIs on the owner's personal subscription: workspace owner only (SENT-X-1 rule). Reads stay member-visible.
  if (request.method !== "GET" && request.method !== "HEAD" && session.ctx.role !== "owner") {
    return NextResponse.json({ error: "atelier_owner_only" }, { status: 403 });
  }
  return { userId: session.ctx.userId, workspaceId: session.ctx.workspaceId };
}
export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
