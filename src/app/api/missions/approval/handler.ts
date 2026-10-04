import { missionApprovalRequestSchema, type MissionApprovalRequest } from "@/server/missions/mission-approval-service";

export function createMissionApprovalHandler(deps: {
  authenticate: () => Promise<{ actorId: string } | Response>; workspaceId: () => string;
  publicOrigin: () => string | undefined;
  service: (context: { workspaceId: string; actorId: string }, request: MissionApprovalRequest) => Promise<{ status: string }>;
}) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
    const actor = await deps.authenticate(); if (actor instanceof Response) return actor;
    let origin = new URL(request.url).origin;
    try {
      const configured = deps.publicOrigin();
      if (configured !== undefined) { const parsed = new URL(configured);
        if (parsed.origin !== configured || !["http:","https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
        origin = parsed.origin;
      }
    } catch { return json({ status: "request_denied" }, 403); }
    if (request.headers.get("origin") !== origin || new URL(request.url).search) return json({ status: "request_denied" }, 403);
    if (!request.body || !request.headers.get("content-type")?.startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    let raw: unknown; const reader = request.body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
    try { raw = await Promise.race([(async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length;
        if (size > 4096) throw Error(); chunks.push(part.value); }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), 5000); })]); }
    catch { return json({ status: "invalid_request" }, 400); }
    finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
    const parsed = missionApprovalRequestSchema.safeParse(raw);
    if (!parsed.success) return json({ status: "invalid_request" }, 400);
    try {
      const result = await deps.service({ workspaceId: deps.workspaceId(), actorId: actor.actorId }, parsed.data);
      return json(result, ["prepared","approved","rejected","revoked"].includes(result.status) ? 200 : result.status === "not_found" ? 404 : result.status === "unavailable" ? 503 : 409);
    } catch { return json({ status: "unavailable" }, 503); }
  };
}
