import "server-only";

// G1b — server-side source of truth for approval decisions.
//
// An approval is never taken from the caller: it is read AND consumed from
// Postgres in one atomic statement (public.consume_approval_decision, migration
// 0033). The function only returns a row when the decision belongs to this
// workspace, was never consumed (consumed_at IS NULL), is still
// status='approved', unexpired, unrevoked, and bound to this exact intent id and
// payload hash; it flips it to 'consumed' in the same UPDATE, so a decision can
// unlock at most one dispatch. Anything else — zero rows, an RPC error, no
// database configured, a malformed row — yields null and the caller fails
// closed. There is deliberately no in-memory fallback: without Postgres there is
// no approval.

import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

export type ConsumedApprovalDecision = {
  workspaceId: string;
  decisionId: string;
  intentId: string;
  payloadHash: string;
  consumedAt: string;
};

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export type ApprovalDecisionRepositoryDeps = {
  /** Defaults to the service-role admin client; null ⇒ unavailable ⇒ fail closed. */
  getClient?: () => RpcClient | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;

export type ApprovalDecisionRepository = {
  consume(workspaceId: string, decisionId: string, intentId: string, payloadHash: string): Promise<ConsumedApprovalDecision | null>;
};

export function createApprovalDecisionRepository(
  deps: ApprovalDecisionRepositoryDeps = {},
): ApprovalDecisionRepository {
  const getClient =
    deps.getClient ?? (() => createOptionalSupabaseAdminClient() as unknown as RpcClient | null);
  return {
    async consume(workspaceId, decisionId, intentId, payloadHash) {
      if (!workspaceId || !UUID_RE.test(decisionId) || !intentId || !HASH_RE.test(payloadHash)) return null;
      let client: RpcClient | null;
      try {
        client = getClient();
      } catch {
        return null;
      }
      if (!client) return null;
      try {
        const { data, error } = await client.rpc("consume_approval_decision", {
          p_workspace_id: workspaceId,
          p_decision_id: decisionId,
          p_intent_id: intentId,
          p_payload_hash: payloadHash,
        });
        if (error) return null;
        const rows = Array.isArray(data) ? data : data ? [data] : [];
        if (rows.length !== 1) return null;
        const row = rows[0] as Record<string, unknown>;
        // Re-verify what the database returned; never trust a partial row.
        if (
          row.id !== decisionId ||
          row.workspace_id !== workspaceId ||
          row.status !== "consumed" ||
          row.intent_id !== intentId ||
          row.payload_hash !== payloadHash ||
          typeof row.consumed_at !== "string"
        ) {
          return null;
        }
        return { workspaceId, decisionId, intentId, payloadHash, consumedAt: row.consumed_at };
      } catch {
        return null;
      }
    },
  };
}

/** Default (real) repository: consumes against Postgres via the admin client. */
export function consumeApprovalDecision(
  workspaceId: string,
  decisionId: string,
  intentId: string,
  payloadHash: string,
): Promise<ConsumedApprovalDecision | null> {
  return createApprovalDecisionRepository().consume(workspaceId, decisionId, intentId, payloadHash);
}
