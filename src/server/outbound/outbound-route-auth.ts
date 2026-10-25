import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { DEFAULT_WORKSPACE_SLUG } from "@/core/workspaces/registry";
import { getAuthenticatedActorId, requireOwnerApiSession } from "@/server/auth/owner";

export type OutboundRouteContext = { workspaceId: string; approverId: string };

/** Same selector contract as #410's requireWorkspaceApiSession: header first, then ?workspace=. */
export function requestedWorkspace(request?: Request): string | null {
  if (!request) return null;
  return request.headers.get("x-oria-workspace") ?? new URL(request.url).searchParams.get("workspace");
}

/**
 * Single auth seam for /api/outbound/*. Owner-only; fails closed on any
 * workspace that this branch cannot authorize. After #410 merges, swap the
 * body for `requireWorkspaceApiSession(request)` + `ctx.role === "owner"`;
 * the route and the selector contract stay unchanged.
 */
export async function requireOutboundOwnerContext(request?: Request): Promise<OutboundRouteContext | NextResponse> {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;
  const ctx = getActiveWorkspaceContext();
  const requested = requestedWorkspace(request);
  if (requested && requested !== ctx.workspace.id && requested !== DEFAULT_WORKSPACE_SLUG) {
    return NextResponse.json({ error: "Espace non autorisé.", code: "WORKSPACE_FORBIDDEN" }, { status: 403 });
  }
  // Attribute approval to the authenticated session, not the configured owner id.
  const approverId = (await getAuthenticatedActorId()) ?? ctx.userId;
  return { workspaceId: ctx.workspace.id, approverId };
}
