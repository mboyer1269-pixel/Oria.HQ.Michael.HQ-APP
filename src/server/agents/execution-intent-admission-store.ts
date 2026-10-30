import "server-only";
import { z } from "zod";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { resolveLedgerHmacKey } from "@/server/ledger/hash-chain-hmac-key";
import { isHashChainWriteEnabled } from "@/server/ledger/hash-chain-write-flag";
import { computeEntryHash } from "@/server/ledger/hash-chain-canonicalizer";
import { toLedgerChainEntry, type LedgerRowForChain } from "@/server/ledger/hash-chain-ledger-fields";
import { computeHmac } from "@/server/ledger/hash-chain-verifier";
import { sealOwnerSpecRow } from "@/server/missions/atelier-owner-spec-contract";
import { admissionReceiptSchema, admissionMatches, admissionLedgerRow, admissionLedgerContentMatches, validAdmissionInput,
  type AdmissionInput, type AdmissionReceipt, type AdmissionPort, type AdmissionResult } from "./execution-intent-admission-contract";

type Db = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
type Deps = { enabled?: () => boolean; hmacKey?: () => string; now?: () => string };
const closed = z.object({ status: z.enum(["invalid_request", "conflict", "approval_required", "not_found"]) }).strict();
const receiptReply = z.object({ status: z.literal("admitted"), receipt: admissionReceiptSchema }).strict();
const ledgerSchema = z.object({ id: z.uuid(), user_id: z.uuid(), workspace_id: z.string(), agent_id: z.null().optional(),
  skill_id: z.null().optional(), mission_id: z.null(), action_type: z.string(), event_type: z.string(), summary: z.string(),
  autonomy_level: z.literal(0), requires_confirmation: z.literal(true), payload: z.record(z.string(), z.unknown()),
  metadata: z.record(z.string(), z.unknown()), created_at: z.iso.datetime({ offset: true }), prev_hash: z.string().nullable(),
  entry_hash: z.string().regex(/^[a-f0-9]{64}$/), hmac: z.string().regex(/^[a-f0-9]{64}$/), canonical_version: z.literal(1) });

/** No fallback or mutation retry. Fresh ACK authority lives only in this store instance, never in serialized receipts. */
export function createExecutionIntentAdmissionStore(db: Db | null | undefined = undefined,
  deps: Deps = {}): AdmissionPort {
  const fresh = new WeakSet<AdmissionReceipt>();
  const key = deps.hmacKey ?? resolveLedgerHmacKey;
  const params = (i: AdmissionInput) => ({ p_workspace_id: i.source.workspaceId, p_actor_id: i.source.actorId,
    p_intent_id: i.source.intentId, p_decision_id: i.decisionId, p_attempt_id: i.attemptId,
    p_source_json: i.sourceJson, p_payload_json: i.payloadJson });
  return {
    async admit(i): Promise<AdmissionResult> {
      try { i = structuredClone(i); } catch { return { status: "invalid_request" }; } // Pin before the first await.
      if (!validAdmissionInput(i)) return { status: "invalid_request" };
      // Lazily constructed after the handler's real owner/session checks, never at route import.
      if (db === undefined) db = createOptionalSupabaseAdminClient() as unknown as Db | null;
      if (!db) return { status: "unavailable" };
      let seal;
      try {
        if (!(deps.enabled ?? isHashChainWriteEnabled)()) return { status: "unavailable" };
        const hmacKey = key(); if (!hmacKey) return { status: "unavailable" };
        const response = await db.rpc("read_atelier_ledger_tail", { p_workspace_id: i.source.workspaceId });
        if (response.error) return { status: "unavailable" };
        const head = z.object({ status: z.literal("ready"), tail: z.unknown().nullable() }).strict().parse(response.data);
        if (head.tail === undefined) return { status: "unavailable" };
        seal = sealOwnerSpecRow(admissionLedgerRow(i), head.tail, hmacKey, (deps.now ?? (() => new Date().toISOString()))());
      } catch { return { status: "unavailable" }; }
      try {
        const response = await db.rpc("admit_execution_intent_v1", { ...params(i), p_seal: seal });
        // A transport/SQL error is not proof of no commit. Do not reissue, even if a later read says pending.
        if (response.error) return { status: "unconfirmed" };
        const refusal = closed.safeParse(response.data); if (refusal.success) return refusal.data;
        const ack = receiptReply.parse(response.data);
        if (!admissionMatches(i, ack.receipt) || ack.receipt.ledgerHash !== seal.entryHash) return { status: "unconfirmed" };
        Object.freeze(ack.receipt); fresh.add(ack.receipt); return ack;
      } catch { return { status: "unconfirmed" }; }
    },
    async takeCurrent(i, receipt) {
      if (!fresh.delete(receipt) || !db) return false;
      try {
        i = structuredClone(i);
        if (!validAdmissionInput(i) || !admissionMatches(i, receipt)) return false;
        const response = await db.rpc("check_execution_intent_admission_v1", params(i));
        if (response.error) return false;
        const ack = z.object({ status: z.literal("current"), receipt: admissionReceiptSchema, ledger: ledgerSchema }).strict().parse(response.data);
        if (JSON.stringify(ack.receipt) !== JSON.stringify(receipt)) return false;
        const row = { ...ack.ledger, agent_id: null, skill_id: null } as LedgerRowForChain;
        const entry = toLedgerChainEntry(row);
        return Boolean(entry && admissionLedgerContentMatches(i, entry) && entry.entry_hash === receipt.ledgerHash
          && computeEntryHash(entry, entry.prev_hash) === entry.entry_hash && computeHmac(entry.entry_hash, key()) === entry.hmac);
      } catch { return false; }
    },
  };
}
