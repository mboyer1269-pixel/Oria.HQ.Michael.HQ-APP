import "server-only";
import { NextResponse } from "next/server";
import { authzIdentity, requireWorkspaceApiSession } from "@/server/auth/owner";
import { isSubscriptionOwner } from "@/server/ai/subscription-owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { createOwnerSpecService } from "./atelier-owner-spec-service";
import { ownerSpecRequestSchema } from "./atelier-owner-spec-contract";

export type OwnerSpecHandlerDeps = { session?: typeof requireWorkspaceApiSession; holder?: typeof isSubscriptionOwner;
  workspace?: typeof getActiveWorkspaceContext; service?: ReturnType<typeof createOwnerSpecService> };
const statusCode = (s: string) => ({ invalid_request: 400, not_found: 404, conflict: 409, approval_required: 409,
  already_admitted: 409, blocked: 403, request_too_large: 413, unavailable: 503, reconciliation_required: 503 }[s] ?? 200);

/** Unmounted candidate. Actual auth defaults, no reaper/model/CLI or global test bypass.
 * A route mounting this handler would be a separate explicit runtime-activation review.
 */
export function createOwnerSpecHandler(deps: OwnerSpecHandlerDeps = {}) {
  return async function ownerSpecHandler(request: Request): Promise<Response> {
    try {
      const session = await (deps.session ?? requireWorkspaceApiSession)(request);
      if (session instanceof Response) return session;
      if (session.ctx.role !== "owner" || session.ctx.userId !== session.user.id || !(deps.holder ?? isSubscriptionOwner)(session.user.id))
        return NextResponse.json({ status: "forbidden" }, { status: 403 });
      const url = new URL(request.url);
      if (request.method !== "POST" || request.headers.get("origin") !== url.origin || url.search !== ""
        || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? ""))
        return NextResponse.json({ status: "invalid_request" }, { status: 400 });
      const length = request.headers.get("content-length");
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > 4096)) return NextResponse.json({ status: "request_too_large" }, { status: 413 });
      const reader = request.body?.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
      let body: unknown;
      try {
        body = await Promise.race([(async () => {
          let size = 0; const chunks: Uint8Array[] = [];
          if (reader) for (;;) { const chunk = await reader.read(); if (chunk.done) break;
            size += chunk.value.length; if (size > 4096) throw Error("request_too_large"); chunks.push(chunk.value);
          }
          return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("body_timeout")), 5000); })]);
      } catch (error) {
        const large = error instanceof Error && error.message === "request_too_large";
        return NextResponse.json({ status: large ? "request_too_large" : "invalid_request" }, { status: large ? 413 : 400 });
      } finally { clearTimeout(timer); void reader?.cancel().catch(() => undefined); }
      const parsed = ownerSpecRequestSchema.safeParse(body);
      if (!parsed.success) return NextResponse.json({ status: "invalid_request" }, { status: 400 });
      const ws = (deps.workspace ?? getActiveWorkspaceContext)({ ...session.ctx, email: session.user.email,
        emailVerified: authzIdentity(session.user).emailVerified });
      const result = await (deps.service ?? createOwnerSpecService()).command(parsed.data, {
        workspaceId: session.ctx.workspaceId, modeId: ws.activeMode.id, actorId: session.user.id });
      return NextResponse.json(result, { status: statusCode(result.status), headers: { "Cache-Control": "no-store" } });
    } catch { return NextResponse.json({ status: "unavailable" }, { status: 503 }); }
  };
}
