import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { MissionStatus } from "@/core/types";
import { resolvePaperclipBinding, type PaperclipBinding, type PaperclipSettings } from "./workspace-binding";

export const DISPATCH_RECEIPT_KEY = "_paperclipDispatch";
export type DispatchMission = { id: string; workspaceId: string; title: string; objective: string; expectedOutput: string; status: MissionStatus; updatedAt: string; input: Record<string, unknown> };
const receiptSchema = z.object({ version: z.literal(1), state: z.enum(["reserved", "outcome_unknown", "linked"]),
  companyId: z.uuid(), correlationKey: z.string().regex(/^hq-mission-[a-f0-9]{64}$/), payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  actorId: z.string().min(1), reservedAt: z.iso.datetime({ offset: true }), remoteIssueId: z.uuid().optional() }).strict();
export type DispatchReceipt = z.infer<typeof receiptSchema>;
export type DispatchStore = {
  load(workspaceId: string, missionId: string): Promise<DispatchMission | null>;
  /** Atomic compare against id, workspace, status, updatedAt and whole input. Never local fallback. */
  compareAndSwap(mission: DispatchMission, input: Record<string, unknown>): Promise<DispatchMission | null>;
  audit(actorId: string, mission: DispatchMission, receipt: DispatchReceipt): Promise<void>;
};
const requestSchema = z.object({ missionId: z.string().min(1).max(160), expectedUpdatedAt: z.iso.datetime({ offset: true }), confirm: z.literal(true) }).strict();
type Dependencies = { authorize: () => Promise<Response | null>; actorId: () => Promise<string | null>; workspaceId: () => string;
  publicOrigin?: () => string | undefined;
  enabled: () => boolean; settings: () => PaperclipSettings; store: () => DispatchStore | null;
  send?: typeof createPaperclipIssue };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (status: number, value: unknown) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });

async function boundedBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !request.body) throw new Error("invalid_body");
  const reader = request.body.getReader(); let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      let bytes = 0; const chunks: Uint8Array[] = [];
      while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if (bytes > 2048) throw new Error("invalid_body"); chunks.push(chunk.value); }
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("invalid_body")), 5000); })]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}

export function createPaperclipDispatchHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    const denied = await deps.authorize(); if (denied) return denied;
    let origin = new URL(request.url).origin;
    const configured = deps.publicOrigin?.() ?? process.env.ORIA_HQ_PUBLIC_ORIGIN;
    if (configured !== undefined) {
      try {
        const parsed = new URL(configured);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== configured || parsed.username || parsed.password) throw new Error("invalid_origin");
        origin = parsed.origin;
      } catch { return json(403, { status: "request_denied" }); }
    }
    // Proxy headers are not an authority: only explicit server configuration may override the request origin.
    if (request.headers.get("origin") !== origin || new URL(request.url).search) return json(403, { status: "request_denied" });
    if (!deps.enabled()) return json(503, { status: "dispatch_disabled" });
    const resolved = resolvePaperclipBinding(deps.settings(), deps.workspaceId());
    if (resolved.status !== "ready") return json(503, { status: resolved.status });
    let parsed;
    try { parsed = requestSchema.safeParse(await boundedBody(request)); } catch { return json(400, { status: "invalid_request" }); }
    if (!parsed.success) return json(400, { status: "invalid_request" });
    try {
      const actorId = await deps.actorId(); if (!actorId) return json(401, { status: "authentication_required" });
      const store = deps.store(); if (!store) return json(503, { status: "durable_store_unavailable" });
      const mission = await store.load(resolved.binding.workspaceId, parsed.data.missionId);
      if (!mission || mission.workspaceId !== resolved.binding.workspaceId) return json(404, { status: "mission_not_found" });
      // Any OpenHands reservation, including incomplete or malformed, requires
      // reconciliation before this mission can be handed to another executor.
      if ("_openhandsReservation" in mission.input) return json(409, { status: "reconciliation_required" });
      const correlationKey = `hq-mission-${hash(JSON.stringify([resolved.binding.companyId, mission.workspaceId, mission.id]))}`;
      if (DISPATCH_RECEIPT_KEY in mission.input) {
        const prior = receiptSchema.safeParse(mission.input[DISPATCH_RECEIPT_KEY]);
        if (!prior.success || prior.data.companyId !== resolved.binding.companyId || prior.data.correlationKey !== correlationKey || (prior.data.state === "linked" && !prior.data.remoteIssueId)) return json(409, { status: "reconciliation_required" });
        return json(prior.data.state === "linked" ? 200 : 409, { status: prior.data.state === "linked" ? "linked" : "reconciliation_required", receipt: prior.data });
      }
      if (mission.updatedAt !== parsed.data.expectedUpdatedAt || !["draft", "queued", "needs_approval"].includes(mission.status)) return json(409, { status: "mission_changed" });
      if (!mission.title.trim() || mission.title.length > 500 || !mission.objective.trim() || mission.objective.length > 8000 || mission.expectedOutput.length > 4000) return json(422, { status: "mission_payload_invalid" });
      const payload = { title: mission.title, description: `${mission.objective}\n\nRésultat attendu :\n${mission.expectedOutput}\n\nHQ reference: ${correlationKey}`,
        status: "backlog" as const, assigneeAgentId: null, idempotencyKey: correlationKey, allowDuplicate: true };
      const receipt: DispatchReceipt = { version: 1, state: "reserved", companyId: resolved.binding.companyId, correlationKey,
        payloadHash: hash(JSON.stringify(payload)), actorId, reservedAt: new Date().toISOString() };
      const reserved = await store.compareAndSwap(mission, { ...mission.input, [DISPATCH_RECEIPT_KEY]: receipt });
      if (!reserved) return json(409, { status: "reservation_conflict" });
      // Audit must persist before any external effect. A failed audit leaves the reservation closed.
      await store.audit(actorId, reserved, receipt);
      let remoteIssueId: string;
      try { remoteIssueId = await (deps.send ?? createPaperclipIssue)(resolved.binding, payload); }
      catch {
        const unknown = { ...receipt, state: "outcome_unknown" as const };
        try { await store.compareAndSwap(reserved, { ...reserved.input, [DISPATCH_RECEIPT_KEY]: unknown }); await store.audit(actorId, reserved, unknown); } catch { /* Original durable reservation still prevents resend. */ }
        return json(409, { status: "reconciliation_required", receipt: unknown });
      }
      const linked = { ...receipt, state: "linked" as const, remoteIssueId };
      const saved = await store.compareAndSwap(reserved, { ...reserved.input, [DISPATCH_RECEIPT_KEY]: linked });
      if (!saved) return json(409, { status: "reconciliation_required", remoteIssueId, correlationKey });
      let auditRecorded = true;
      try { await store.audit(actorId, saved, linked); } catch { auditRecorded = false; }
      return json(201, { status: "linked", receipt: linked, auditRecorded, executionRequested: false });
    } catch { return json(503, { status: "durable_operation_unavailable", reconciliationRequired: true }); }
  };
}

export async function createPaperclipIssue(binding: PaperclipBinding, payload: { title: string; description: string; status: "backlog"; assigneeAgentId: null; idempotencyKey: string; allowDuplicate: boolean }, fetcher: typeof fetch = fetch): Promise<string> {
  if (resolvePaperclipBinding({ ...binding, enabled: true }, binding.workspaceId).status !== "ready") throw new Error("dispatch_unavailable");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    return await Promise.race([(async () => {
      const response = await fetcher(new URL(`/api/companies/${binding.companyId}/issues`, binding.baseUrl), {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${binding.token}` }, body: JSON.stringify(payload),
      });
      if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("application/json")) throw new Error("dispatch_unknown");
      reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 256 * 1024) throw new Error("dispatch_unknown"); chunks.push(part.value); }
      const parsed = z.object({ id: z.uuid(), companyId: z.literal(binding.companyId), description: z.string() }).safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))));
      if (!parsed.success || !parsed.data.description.includes(`HQ reference: ${payload.idempotencyKey}`)) throw new Error("dispatch_unknown");
      return parsed.data.id;
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("dispatch_unknown")); }, 5000); })]);
  } catch { throw new Error("dispatch_outcome_unknown"); }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
