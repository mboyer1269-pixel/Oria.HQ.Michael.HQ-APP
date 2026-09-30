import { z } from "zod";
import { openHandsSubmissionRequestSchema, type OpenHandsSubmissionRequest } from "@/server/missions/openhands-submission";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare_launch"), missionId: z.uuid() }).strict(),
  z.object({ action: z.literal("confirm_launch"), missionId: z.uuid(), expectedLaunchHash: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true) }).strict(),
  openHandsSubmissionRequestSchema.extend({ action: z.literal("prepare") }).strict(),
  openHandsSubmissionRequestSchema.extend({ action: z.literal("attach_memory"), projectId: z.string().trim().min(1).max(160) }).strict(),
  openHandsSubmissionRequestSchema.extend({ action: z.literal("confirm"), expectedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/), confirm: z.literal(true) }).strict(),
]);
export function createOpenHandsHandler(deps: {
  authenticate: () => Promise<{ actorId: string } | Response>; enabled: () => boolean;
  workspaceId: () => string; publicOrigin: () => string | undefined;
  launch?: (context: {workspaceId: string; actorId: string}, missionId: string,
    confirmation?: {expectedLaunchHash: string; confirm: true}) => Promise<{status: string; [key: string]: unknown}>;
  attachMemory?: (context: {workspaceId: string; actorId: string}, request: unknown) => Promise<{status: string; [key: string]: unknown}>;
  service: (context: { workspaceId: string; actorId: string }, request: OpenHandsSubmissionRequest,
    confirmation?: { expectedPayloadHash: string; confirm: true }) => Promise<{ status: string; [key: string]: unknown }>;
}) {
  return async (request: Request) => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
    const auth = await deps.authenticate(); if (auth instanceof Response) return auth;
    if (!deps.enabled()) return json({ status: "disabled", externalEffectAllowed: false }, 503);
    let origin = new URL(request.url).origin;
    try { const configured = deps.publicOrigin(); if (configured !== undefined) {
      const parsed = new URL(configured);
      if (parsed.origin !== configured || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw Error();
      origin = parsed.origin;
    } } catch { return json({ status: "request_denied" }, 403); }
    if (request.headers.get("origin") !== origin || new URL(request.url).search) return json({ status: "request_denied" }, 403);
    if (!request.body || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ status: "invalid_request" }, 400);
    const reader = request.body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined; let raw: unknown;
    try { raw = await Promise.race([(async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 8192) throw Error(); chunks.push(part.value); }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), 5000); })]); }
    catch { return json({ status: "invalid_request" }, 400); }
    finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
    const parsed = schema.safeParse(raw); if (!parsed.success) return json({ status: "invalid_request" }, 400);
    const { action } = parsed.data;
    if (parsed.data.action === "prepare_launch" || parsed.data.action === "confirm_launch") {
      if (!deps.launch) return json({status:"disabled",externalEffectAllowed:false},503);
      try {
        const confirmation = parsed.data.action === "confirm_launch"
          ? {expectedLaunchHash:parsed.data.expectedLaunchHash,confirm:true as const} : undefined;
        const value = await deps.launch({workspaceId:deps.workspaceId(),actorId:auth.actorId},parsed.data.missionId,confirmation);
        return json(value, ["prepared","claimed"].includes(value.status) ? 200 : value.status === "not_found" ? 404
          : ["disabled","unavailable","reconciliation_required"].includes(value.status) ? 503 : 409);
      } catch { return json({status:action === "confirm_launch" ? "reconciliation_required" : "unavailable",externalEffectAllowed:false},503); }
    }
    if (parsed.data.action === "attach_memory") {
      if (!deps.attachMemory) return json({status:"disabled", externalEffectAllowed:false},503);
      const {action: _action, ...attachment} = parsed.data;
      void _action;
      try {
        const value = await deps.attachMemory({workspaceId:deps.workspaceId(),actorId:auth.actorId},attachment);
        return json(value, ["attached","already_attached"].includes(value.status) ? 200 :
          ["unavailable","memory_unavailable","attachment_outcome_unknown"].includes(value.status) ? 503 : value.status === "not_found" ? 404 : 409);
      } catch { return json({status:"attachment_outcome_unknown",externalEffectAllowed:false},503); }
    }
    const submission = openHandsSubmissionRequestSchema.parse(Object.fromEntries(Object.entries(parsed.data).filter(([key]) => !["action", "confirm", "expectedPayloadHash"].includes(key))));
    try {
      const confirmation = parsed.data.action === "confirm" ? { expectedPayloadHash: parsed.data.expectedPayloadHash, confirm: true as const } : undefined;
      const value = await deps.service({ workspaceId: deps.workspaceId(), actorId: auth.actorId }, submission, confirmation);
      const status = ["prepared", "reserved", "already_reserved"].includes(value.status) ? 200 : value.status === "not_found" ? 404
        : ["unavailable", "authorization_outcome_unknown"].includes(value.status) ? 503 : value.status === "invalid_request" ? 400 : 409;
      return json(value, status);
    } catch { return json({ status: action === "confirm" ? "reconciliation_required" : "unavailable", externalEffectAllowed: false }, 503); }
  };
}
