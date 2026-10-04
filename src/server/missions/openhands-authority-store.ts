import "server-only";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import type { Json } from "@/server/db/types";
import type { OpenHandsSubmissionDossier } from "./openhands-submission";
import { validateOpenHandsAuthorization, type OpenHandsAuthorization } from "./openhands-reservation";

/** RFC9562 UUIDv8 custom layout: deterministic scoped approval identity. */
export function openHandsAuthorizationId(dossier: OpenHandsSubmissionDossier, actorId: string) {
  const bytes = createHash("sha256").update(JSON.stringify(["oria.openhands.authorization.v1", dossier.mission.workspaceId, dossier.idempotencyKey, dossier.payloadHash, actorId])).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 15) | 128; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export class OpenHandsAuthorityError extends Error {
  constructor(public readonly reason: "expired" | "conflict") { super("authority_rejected"); }
}
export type OpenHandsAuthorityStore = { persist(dossier: OpenHandsSubmissionDossier, actorId: string, now: number): Promise<OpenHandsAuthorization> };

/** Same durable action ledger, insert-or-ignore with deterministic primary key.
 * Canonical reread proves the returned authorization was persisted. No local mode.
 */
export function createOpenHandsAuthorityStore(client = createOptionalSupabaseAdminClient()): OpenHandsAuthorityStore | null {
  if (!client) return null;
  return { async persist(dossier, actorId, now) {
    const id = openHandsAuthorizationId(dossier, actorId);
    const authorization: OpenHandsAuthorization = { version: 1, id, scope: "openhands.submission", workspaceId: dossier.mission.workspaceId,
      missionId: dossier.mission.id, missionVersion: dossier.mission.version, idempotencyKey: dossier.idempotencyKey, payloadHash: dossier.payloadHash,
      actorId, approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString() };
    const { error } = await client.from("action_ledger").upsert({ id, user_id: actorId, action_type: "mission.openhands_authorization", event_type: "decision",
      summary: "Owner confirmed exact OpenHands submission dossier; no execution", autonomy_level: 0, requires_confirmation: true,
      workspace_id: dossier.mission.workspaceId, mission_id: dossier.mission.id, model_id: null, cost_mode: null, skill_id: null, agent_id: null,
      payload: dossier as unknown as Json, metadata: { authorization } as unknown as Json }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw Error("authority_persistence_unknown");
    const { data, error: readError } = await client.from("action_ledger").select().eq("id", id).eq("workspace_id", dossier.mission.workspaceId).eq("user_id", actorId).maybeSingle();
    if (readError || !data || data.action_type !== "mission.openhands_authorization" || data.event_type !== "decision" || data.mission_id !== dossier.mission.id
      || data.id !== id || data.user_id !== actorId || data.workspace_id !== dossier.mission.workspaceId || !isDeepStrictEqual(data.payload, dossier)) throw Error("authority_persistence_unknown");
    const metadata = data.metadata as { authorization?: unknown } | null;
    const canonical = validateOpenHandsAuthorization(metadata?.authorization, dossier, actorId, now);
    if (!canonical || canonical.id !== id) {
      const expires = (metadata?.authorization as { expiresAt?: unknown } | undefined)?.expiresAt;
      if (typeof expires === "string" && Number.isFinite(Date.parse(expires)) && Date.parse(expires) <= now) throw new OpenHandsAuthorityError("expired");
      throw new OpenHandsAuthorityError("conflict");
    }
    return canonical;
  } };
}
