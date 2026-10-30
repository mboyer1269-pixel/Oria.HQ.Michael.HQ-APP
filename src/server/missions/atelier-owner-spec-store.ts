import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { resolveLedgerHmacKey } from "@/server/ledger/hash-chain-hmac-key";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
import type { Mission } from "@/core/types";
import type { MissionRow } from "@/server/db/types";
import { mapMissionRow } from "./mission-row";
import { ownerSpecContextSchema, ownerSpecPayloadSchema, ownerSpecReviewSchema, readOwnerSpecReview,
  ownerSpecAdmissionSchema, ownerSpecAdmissionMatches, ownerSpecSnapshot, ownerSpecLedgerRow, sealOwnerSpecRow,
  validateOwnerSpecResult, sha256, type OwnerSpecContext, type OwnerSpecPayload, type OwnerSpecAdmission,
  type OwnerSpecExecution, type OwnerSpecReview } from "./atelier-owner-spec-contract";

type Reply = PromiseLike<{ data: unknown; error: unknown }>;
type Query = { eq(key: string, value: string): Query; maybeSingle(): Reply };
export type OwnerSpecDb = { rpc(name: string, params: Record<string, unknown>): Reply;
  from(table: string): { select(columns: string): Query } };
type Closed = { status: "invalid_request" | "not_found" | "conflict" | "approval_required" | "already_admitted"
  | "unavailable" | "reconciliation_required" | "request_too_large" };
const deniedSchema = z.object({ status: z.enum(["not_found", "conflict", "approval_required", "already_admitted", "refused"]) }).strict();
export type OwnerSpecStoreDeps = { hmacKey?: () => string; enabled?: () => boolean; now?: () => string; uuid?: () => string };
export const OWNER_SPEC_RPC_LIMIT = 256_000;

/** Dormant authenticated-owner boundary; no fallback store, retry or authority from old receipts. */
export function createOwnerSpecStore(db: OwnerSpecDb | null = createOptionalSupabaseAdminClient() as unknown as OwnerSpecDb | null,
  deps: OwnerSpecStoreDeps = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const uuid = deps.uuid ?? randomUUID;
  async function rpc(name: string, params: Record<string, unknown>) {
    if (!db) throw new Error("unavailable");
    if (Buffer.byteLength(JSON.stringify(params)) > OWNER_SPEC_RPC_LIMIT) throw new Error("request_too_large");
    const response = await db.rpc(name, params); if (response.error) throw new Error("rpc_uncertain"); return response.data;
  }
  const closed = (error: unknown): Closed => ({ status: error instanceof Error && error.message === "request_too_large"
    ? "request_too_large" : "reconciliation_required" });
  async function seal(p: OwnerSpecPayload, hash: string, attemptId: string, decisionId: string,
    event: "admit" | "result", id: string, result?: ReturnType<typeof validateOwnerSpecResult>) {
    if (!(deps.enabled ?? isHashChainWriteEnabled)()) throw new Error("sealing_unavailable");
    const key = (deps.hmacKey ?? resolveLedgerHmacKey)(); if (!key) throw new Error("sealing_unavailable");
    const head = z.object({ status: z.literal("ready"), tail: z.unknown().nullable() }).strict().parse(
      await rpc("read_atelier_ledger_tail", { p_workspace_id: p.workspaceId }));
    if (head.tail === undefined) throw new Error("tail_missing");
    return sealOwnerSpecRow(ownerSpecLedgerRow(p, hash, attemptId, decisionId, event, id, result ?? undefined), head.tail, key, now());
  }
  return {
    async load(context: OwnerSpecContext, missionId: string): Promise<Mission | null> {
      const ctx = ownerSpecContextSchema.parse(context); z.uuid().parse(missionId);
      if (!db) throw new Error("unavailable");
      const { data, error } = await db.from("missions").select("*").eq("workspace_id", ctx.workspaceId).eq("id", missionId).maybeSingle();
      if (error) throw new Error("read_unavailable"); if (!data) return null;
      const m = mapMissionRow(data as MissionRow);
      return m.id === missionId && m.workspaceId === ctx.workspaceId && m.modeId === ctx.modeId ? m : null;
    },
    async review(m: Mission, ctx: OwnerSpecContext, raw: OwnerSpecPayload): Promise<Closed | { status: "reviewed"; review: OwnerSpecReview }> {
      if (!db) return { status: "unavailable" };
      const parsed = ownerSpecPayloadSchema.safeParse(raw); if (!parsed.success) return { status: "invalid_request" };
      const payloadJson = JSON.stringify(parsed.data);
      if (Buffer.byteLength(payloadJson) > 32_000) return { status: "request_too_large" };
      try {
        const data = await rpc("prepare_atelier_owner_spec_v2", { p_workspace_id: ctx.workspaceId, p_actor_id: ctx.actorId,
          p_mission_id: m.id, p_expected_updated_at: m.updatedAt, p_expected_snapshot: ownerSpecSnapshot(m), p_payload_json: payloadJson });
        const denied = deniedSchema.safeParse(data); if (denied.success) return { status: denied.data.status === "refused" ? "conflict" : denied.data.status };
        const response = z.object({ status: z.literal("reviewed"), review: ownerSpecReviewSchema }).strict().parse(data);
        if (!readOwnerSpecReview(response.review) || response.review.payloadJson !== payloadJson) return { status: "reconciliation_required" };
        return response;
      } catch (error) { return closed(error); }
    },
    async admit(p: OwnerSpecPayload, hash: string): Promise<Closed | { status: "admitted" | "existing"; receipt: OwnerSpecAdmission }> {
      if (!db) return { status: "unavailable" };
      if (!ownerSpecPayloadSchema.safeParse(p).success || sha256(JSON.stringify(p)) !== hash) return { status: "invalid_request" };
      const attemptId = uuid(), decisionId = uuid(); let envelope;
      try { envelope = await seal(p, hash, attemptId, decisionId, "admit", attemptId); }
      catch { return { status: "unavailable" }; }
      try {
        const data = await rpc("admit_atelier_owner_spec_v2", { p_workspace_id: p.workspaceId, p_actor_id: p.actorId,
          p_mission_id: p.missionId, p_review_hash: hash, p_decision_id: decisionId, p_attempt_id: attemptId, p_seal: envelope });
        const denied = deniedSchema.safeParse(data); if (denied.success) return { status: denied.data.status === "refused" ? "conflict" : denied.data.status };
        const response = z.object({ status: z.enum(["admitted", "existing"]), receipt: ownerSpecAdmissionSchema }).strict().parse(data);
        if (!ownerSpecAdmissionMatches(response.receipt, p, hash) || (response.status === "admitted"
          && (response.receipt.attemptId !== attemptId || response.receipt.decisionId !== decisionId))) return { status: "reconciliation_required" };
        return response;
      } catch (error) { return closed(error); }
    },
    async current(e: OwnerSpecExecution): Promise<boolean> {
      if (!db) return false;
      try {
        const data = await rpc("check_atelier_owner_spec_admission_v2", { p_workspace_id: e.payload.workspaceId,
          p_actor_id: e.payload.actorId, p_mission_id: e.payload.missionId, p_attempt_id: e.receipt.attemptId, p_review_hash: e.payloadHash });
        const response = z.object({ status: z.literal("current"), receipt: ownerSpecAdmissionSchema }).strict().parse(data);
        return JSON.stringify(response.receipt) === JSON.stringify(ownerSpecAdmissionSchema.parse(e.receipt));
      } catch { return false; }
    },
    async record(e: OwnerSpecExecution, raw: unknown): Promise<Closed | { status: "recorded" | "existing" }> {
      const result = validateOwnerSpecResult(raw, e); if (!result) return { status: "invalid_request" };
      if (!db) return { status: "unavailable" };
      const resultId = uuid(); let envelope;
      try { envelope = await seal(e.payload, e.payloadHash, e.receipt.attemptId, e.receipt.decisionId, "result", resultId, result); }
      catch { return { status: "unavailable" }; }
      try {
        const data = await rpc("record_atelier_owner_spec_result_v2", { p_workspace_id: e.payload.workspaceId,
          p_actor_id: e.payload.actorId, p_mission_id: e.payload.missionId, p_attempt_id: e.receipt.attemptId,
          p_review_hash: e.payloadHash, p_result: result, p_result_id: resultId, p_seal: envelope });
        return z.object({ status: z.enum(["recorded", "existing", "conflict", "not_found"]) }).strict().parse(data);
      } catch (error) { return closed(error); }
    },
  };
}
export type OwnerSpecStore = ReturnType<typeof createOwnerSpecStore>;
