import { z } from "zod";
import type { OpenHandsSubmissionDossier, OpenHandsSubmissionRequest } from "@/server/missions/openhands-submission";
const id = z.string().min(1).max(160), hash = z.string().regex(/^[a-f0-9]{64}$/), date = z.iso.datetime({ offset: true });
const budget = z.object({ maxCostCents: z.number().int().min(1).max(10000), maxTokens: z.number().int().min(1).max(200000), maxIterations: z.number().int().min(1).max(100), timeoutSeconds: z.number().int().min(1).max(1800) }).strict();
export const openHandsFormSchema = z.object({ missionId: z.uuid(), expectedUpdatedAt: date, commitSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/).refine((v) => !/^0+$/.test(v)), executorVersion: z.string().regex(/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/).max(64), budget }).strict();
const key = z.string().regex(/^hq-openhands-v1-[a-f0-9]{64}$/);
const memorySchema = z.object({ contractVersion: z.literal(1), sourceTool: z.literal("agentmemory_context_pack"),
  workspaceId: id, projectId: id, namespace: z.string().min(1).max(256), centerEntityId: id,
  retrievedAtIso: date, content: z.string().min(1).max(4000), contentChars: z.number().int().min(1).max(4000),
  redactionsApplied: z.number().int().nonnegative(), snapshotHash: hash }).strict();
const dossierSchema = z.object({ contractVersion: z.union([z.literal(1), z.literal(2)]), executor: z.literal("openhands"), executorVersion: z.string().max(64),
  mission: z.object({ id: z.uuid(), workspaceId: id, modeId: id, version: date, title: z.string().min(1).max(200), objective: z.string().min(1).max(4000), scope: z.string().min(1).max(1000), acceptanceCriteria: z.string().min(1).max(2000), expectedOutput: z.string().min(1).max(4000), createdBy: id }).strict(),
  source: z.object({ commitSha: z.string(), commitVerification: z.literal("not_verified") }).strict(), budget,
  approvalRequired: z.literal(true), executionRequested: z.literal(false), idempotencyKey: key, payloadHash: hash,
  memory: memorySchema.optional() }).strict().refine((d) => d.contractVersion === 2 ?
    !!d.memory && d.memory.workspaceId === d.mission.workspaceId && d.memory.contentChars === d.memory.content.length : d.memory === undefined);
const receiptSchema = z.object({ version: z.literal(1), reservationId: z.uuid(), state: z.enum(["reserved", "audit_recorded", "outcome_unknown"]), workspaceId: id, missionId: z.uuid(), missionVersion: date, idempotencyKey: key, payloadHash: hash, authorizationId: z.uuid(), actorId: id, reservedAt: date, authorizationExpiresAt: date, auditId: id.optional() }).strict();
export type OpenHandsPending = { version: 1; workspaceId: string; request: OpenHandsSubmissionRequest; expectedPayloadHash: string };
const pendingSchema = z.object({ version: z.literal(1), workspaceId: id, request: openHandsFormSchema, expectedPayloadHash: hash }).strict();
export function parseOpenHandsPending(raw: string | null, workspaceId: string, missionId: string): OpenHandsPending | null {
  if (raw === null) return null;
  if (raw.length > 4096) throw Error("invalid_pending");
  const p = pendingSchema.parse(JSON.parse(raw));
  if (p.workspaceId !== workspaceId || p.request.missionId !== missionId) throw Error("foreign_pending");
  Object.freeze(p.request.budget); Object.freeze(p.request); return Object.freeze(p);
}
export type OpenHandsUiResult = { kind: "prepared"; dossier: OpenHandsSubmissionDossier } | { kind: "reserved"; reference: string }
  | { kind: "blocked" | "uncertain"; message: string; canPrepareAgain?: boolean };
const messages: Record<string, string> = {
  disabled: "La préparation OpenHands est désactivée sur le serveur.",
  stale_version: "La mission a changé. Actualisez le dossier avant une nouvelle préparation.",
  dossier_changed: "Le contenu a changé : cette confirmation n’a pas été appliquée. Préparez et relisez le dossier à nouveau.",
  ineligible_mission: "Cette mission n’est pas admissible à une préparation OpenHands.",
  not_found: "La mission n’est pas disponible dans cet espace.",
  invalid_request: "Vérifiez le commit, la version et les limites saisis.",
  request_denied: "La requête a été refusée. Vérifiez votre session et l’adresse de HQ.",
  unauthenticated: "Reconnectez-vous avant de poursuivre.", forbidden: "Cette opération est réservée au propriétaire.",
  authorization_denied: "L’autorisation du dossier n’a pas été acceptée.",
  authorization_expired: "L’autorisation a expiré. Son renouvellement n’est pas encore disponible dans HQ.",
  conflict: "Une version ou une réservation différente existe. Actualisez et vérifiez le reçu.",
};
export async function requestOpenHands(action: "prepare" | "confirm", pending: OpenHandsPending, fetcher: typeof fetch = fetch): Promise<OpenHandsUiResult> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  const unknown = (): OpenHandsUiResult => ({ kind: action === "confirm" ? "uncertain" : "blocked", message: action === "confirm" ? "Issue inconnue. Vérifiez le reçu avant toute autre confirmation." : "La vérification n’a pas abouti. Aucun nouvel envoi de confirmation n’a été effectué." });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetcher("/api/orchestration/openhands", { method: "POST", credentials: "same-origin", redirect: "error", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...pending.request, ...(action === "confirm" ? { expectedPayloadHash: pending.expectedPayloadHash, confirm: true } : {}) }) });
    if (!response.body || !response.headers.get("content-type")?.includes("application/json")) return unknown();
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 65536) return unknown(); chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
    const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (action === "prepare" && response.ok && raw.status === "prepared" && raw.externalEffectAllowed === false) {
      const parsed = dossierSchema.safeParse(raw.dossier); if (!parsed.success) return unknown();
      const d = parsed.data, r = pending.request;
      if (d.mission.id !== r.missionId || d.mission.workspaceId !== pending.workspaceId || d.mission.version !== r.expectedUpdatedAt || d.source.commitSha !== r.commitSha || d.executorVersion !== r.executorVersion
        || Object.keys(r.budget).some((k) => d.budget[k as keyof typeof r.budget] !== r.budget[k as keyof typeof r.budget])) return unknown();
      Object.freeze(d.mission); Object.freeze(d.source); Object.freeze(d.budget);
      if (d.memory) Object.freeze(d.memory);
      return { kind: "prepared", dossier: Object.freeze(d) };
    }
    if (response.ok && ["reserved", "already_reserved"].includes(raw.status) && raw.externalEffectAllowed === false) {
      const p = receiptSchema.safeParse(raw.receipt);
      if (!p.success || p.data.state !== "audit_recorded" || !p.data.auditId || p.data.workspaceId !== pending.workspaceId || p.data.missionId !== pending.request.missionId || p.data.missionVersion !== pending.request.expectedUpdatedAt || p.data.payloadHash !== pending.expectedPayloadHash) return unknown();
      return { kind: "reserved", reference: p.data.reservationId };
    }
    if (["reconciliation_required", "authorization_outcome_unknown"].includes(raw.status)) return { kind: "uncertain", message: "Une réservation ou une autorisation doit être vérifiée. Aucun renvoi automatique. Vérifiez le reçu ; si cet état persiste, une réconciliation serveur est nécessaire." };
    if (typeof raw.status === "string" && messages[raw.status]) {
      const preEffectCodes: Record<string, number> = { stale_version: 409, dossier_changed: 409, invalid_request: 400, ineligible_mission: 409, not_found: 404, request_denied: 403, unauthenticated: 401, forbidden: 403, disabled: 503 };
      return { kind: "blocked", message: messages[raw.status], canPrepareAgain: preEffectCodes[raw.status] === response.status };
    }
    return unknown();
  } catch { return unknown(); }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}
