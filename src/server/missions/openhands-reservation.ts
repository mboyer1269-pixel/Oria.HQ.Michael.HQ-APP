import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Mission } from "@/core/types";
import { buildOpenHandsSubmission, type OpenHandsSubmissionDossier } from "./openhands-submission";
import { createOpenHandsReservationStore } from "./openhands-reservation-store";

export const OPENHANDS_RESERVATION_KEY = "_openhandsReservation";
const id = z.string().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.iso.datetime({ offset: true });
export const openHandsAuthorizationSchema = z.object({
  version: z.literal(1), id: z.uuid(), scope: z.literal("openhands.submission"),
  workspaceId: id, missionId: z.uuid(), missionVersion: version,
  idempotencyKey: z.string().regex(/^hq-openhands-v1-[a-f0-9]{64}$/), payloadHash: digest,
  actorId: id, approvedAt: version, expiresAt: version,
}).strict();
export type OpenHandsAuthorization = z.infer<typeof openHandsAuthorizationSchema>;
export const openHandsReceiptSchema = z.object({
  version: z.literal(1), reservationId: z.uuid(), state: z.enum(["reserved", "audit_recorded", "outcome_unknown"]),
  workspaceId: id, missionId: z.uuid(), missionVersion: version,
  idempotencyKey: z.string().regex(/^hq-openhands-v1-[a-f0-9]{64}$/), payloadHash: digest,
  authorizationId: z.uuid(), actorId: id, reservedAt: version,
  authorizationExpiresAt: version, auditId: id.optional(),
}).strict().refine((value) => value.state !== "audit_recorded" || !!value.auditId);
export type OpenHandsReservationReceipt = z.infer<typeof openHandsReceiptSchema>;
export type OpenHandsReservationStore = {
  load(workspaceId: string, missionId: string): Promise<Mission | null>;
  compareAndSwap(mission: Mission, receipt: OpenHandsReservationReceipt): Promise<Mission | null>;
  audit(mission: Mission, receipt: OpenHandsReservationReceipt): Promise<string>;
};
export type ReservationResult = { status: "reserved" | "already_reserved"; receipt: OpenHandsReservationReceipt; externalEffectAllowed: false }
  | { status: "invalid_request" | "not_found" | "ineligible_mission" | "stale_version" | "authorization_denied" | "conflict" | "reconciliation_required" | "unavailable"; externalEffectAllowed: false };
const result = (status: Exclude<ReservationResult["status"], "reserved" | "already_reserved">): ReservationResult => ({ status, externalEffectAllowed: false });

/** Structure/binding/time checks only. Authenticity and owner authority MUST be
 * established by the server authority resolver, never a browser-supplied record.
 * This scope approves this exact submission dossier, not individual tool actions.
 */
export function validateOpenHandsAuthorization(raw: unknown, dossier: OpenHandsSubmissionDossier, actorId: string, now: number): OpenHandsAuthorization | null {
  const parsed = openHandsAuthorizationSchema.safeParse(raw);
  if (!parsed.success || !Number.isFinite(now)) return null;
  const a = parsed.data;
  const approved = Date.parse(a.approvedAt), expires = Date.parse(a.expiresAt);
  if (!Number.isFinite(approved) || !Number.isFinite(expires) || approved > now || expires <= now || expires <= approved || expires - approved > 86400000
    || a.actorId !== actorId || a.workspaceId !== dossier.mission.workspaceId || a.missionId !== dossier.mission.id
    || a.missionVersion !== dossier.mission.version || a.idempotencyKey !== dossier.idempotencyKey || a.payloadHash !== dossier.payloadHash) return null;
  return a;
}

export function createOpenHandsReservationService(deps: {
  store?: () => OpenHandsReservationStore | null;
  /** Required trusted server boundary: persisted approval and actual owner identity. */
  resolveAuthorization: (dossier: OpenHandsSubmissionDossier, actorId: string) => Promise<unknown>;
  now?: () => number;
}) {
  return async (context: { workspaceId: string; actorId: string }, request: unknown): Promise<ReservationResult> => {
    const header = z.object({ missionId: z.uuid() }).passthrough().safeParse(request);
    if (!header.success || !id.safeParse(context.workspaceId).success || !id.safeParse(context.actorId).success) return result("invalid_request");
    let reservationAttempted = false;
    try {
      const store = (deps.store ?? createOpenHandsReservationStore)();
      if (!store) return result("unavailable");
      const mission = await store.load(context.workspaceId, header.data.missionId);
      if (!mission || mission.workspaceId !== context.workspaceId || mission.id !== header.data.missionId) return result("not_found");
      const priorRaw = mission.input[OPENHANDS_RESERVATION_KEY];
      const prior = priorRaw === undefined ? null : openHandsReceiptSchema.safeParse(priorRaw);
      if (prior && (!prior.success || prior.data.workspaceId !== context.workspaceId || prior.data.missionId !== mission.id)) return result("reconciliation_required");
      const candidate = { ...mission, input: { ...mission.input } };
      if (prior?.success) {
        delete candidate.input[OPENHANDS_RESERVATION_KEY];
        candidate.updatedAt = prior.data.missionVersion;
      }
      const prepared = buildOpenHandsSubmission(candidate, context.workspaceId, request);
      if (prepared.status !== "prepared") return result(prior ? "conflict" : prepared.status);
      const dossier = prepared.dossier;
      if (prior?.success) {
        if (prior.data.actorId !== context.actorId) return result("authorization_denied");
        if (prior.data.idempotencyKey !== dossier.idempotencyKey || prior.data.payloadHash !== dossier.payloadHash) return result("conflict");
        if (prior.data.state !== "audit_recorded") return result("reconciliation_required");
        return { status: "already_reserved", receipt: prior.data, externalEffectAllowed: false };
      }
      const authorizationRaw = await deps.resolveAuthorization(dossier, context.actorId);
      const now = (deps.now ?? Date.now)();
      const authorization = validateOpenHandsAuthorization(authorizationRaw, dossier, context.actorId, now);
      if (!authorization) return result("authorization_denied");
      const receipt: OpenHandsReservationReceipt = { version: 1, reservationId: randomUUID(), state: "reserved",
        workspaceId: context.workspaceId, missionId: mission.id, missionVersion: mission.updatedAt,
        idempotencyKey: dossier.idempotencyKey, payloadHash: dossier.payloadHash, authorizationId: authorization.id,
        actorId: context.actorId, reservedAt: new Date(now).toISOString(), authorizationExpiresAt: authorization.expiresAt };
      reservationAttempted = true;
      const reserved = await store.compareAndSwap(mission, receipt);
      if (!reserved) return result("conflict");
      // Closed reservation survives an audit failure or an ambiguous write result.
      const auditId = await store.audit(reserved, receipt);
      if (!id.safeParse(auditId).success) return result("reconciliation_required");
      const audited = { ...receipt, state: "audit_recorded" as const, auditId };
      const saved = await store.compareAndSwap(reserved, audited);
      if (!saved) return result("reconciliation_required");
      return { status: "reserved", receipt: audited, externalEffectAllowed: false };
    } catch { return result(reservationAttempted ? "reconciliation_required" : "unavailable"); }
  };
}
