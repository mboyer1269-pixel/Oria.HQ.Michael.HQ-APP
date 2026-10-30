import "server-only";
import { z } from "zod";
import { getCurrentAuthUser, authzIdentity } from "@/server/auth/owner";
import { resolveAuthzContext, type AuthzContext } from "@/server/auth/authz-context";
import { getAgentExecutionIntent } from "./execution-intent-repository";
import { hashExecutionIntentPayload } from "./execution-intent-payload-hash";
import { stableStringify, type CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";
import { evaluateLiveExecution, guardGovernedAction } from "@/server/runtime/execution-guard";
import { TOOL_GOVERNED_ACTIONS } from "@/server/runtime/governed-tool-dispatch";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fields = { intentId: z.string().min(1).max(200), requestId: z.string().uuid(), expectedPayloadHash: hash };
const commandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("review"), intentId: fields.intentId }).strict(),
  z.object({ ...fields, command: z.literal("confirm"), expectedIntentHash: hash, confirmed: z.literal(true),
    rationale: z.string().trim().min(1).max(2000), expiresAt: z.string().datetime({ offset: true }) }).strict(),
  z.object({ ...fields, command: z.literal("recover") }).strict(),
]);
const snapshotSchema = z.object({ agentId: z.string().min(1), skillId: z.string().min(1), toolName: z.string().min(1),
  autonomyLevel: z.number().int().min(0).max(5), payload: z.record(z.string(), z.unknown()) }).strict();
const observationSchema = z.object({ state: z.enum(["approved", "consumed", "expired", "revoked"]),
  decisionId: z.string().uuid(), requestId: z.string().uuid(), workspaceId: z.string().min(1), actorId: z.string().uuid(),
  intentId: z.string().min(1), payloadHash: hash, createdAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }), rationale: z.string().min(1).max(2000),
  intentSnapshot: snapshotSchema, payloadJson: z.string().min(1).max(64000), executionAuthorized: z.literal(false) }).strict();
const ctxSchema = z.object({ userId: z.string().uuid(), workspaceId: z.string().min(1), role: z.literal("owner") });
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export type ApprovalDecisionProducerDeps = {
  authorize?: () => Promise<AuthzContext | null>;
  loadIntent?: typeof getAgentExecutionIntent;
  evaluate?: typeof evaluateLiveExecution;
  getClient?: () => RpcClient | null;
  now?: () => number;
};
async function authenticatedOwner(): Promise<AuthzContext | null> {
  const user = await getCurrentAuthUser();
  return user ? resolveAuthzContext(authzIdentity(user)) : null;
}

/** Dormant candidate: no HTTP caller, no agent licence and no execution port.
 * The authenticated owner is resolved server-side BEFORE all data access. SQL
 * trusts this boundary for config-first membership; a service-role credential
 * alone is not evidence of a human. The original dispatch gate/consume/ledger
 * remain mandatory and unchanged. An ACK loss permits observation, not retry.
 */
export function createApprovalDecisionProducer(deps: ApprovalDecisionProducerDeps = {}) {
  const authorize = deps.authorize ?? authenticatedOwner;
  const load = deps.loadIntent ?? getAgentExecutionIntent;
  const evaluate = deps.evaluate ?? evaluateLiveExecution;
  const getClient = deps.getClient ?? (() => createOptionalSupabaseAdminClient() as RpcClient | null);
  const now = deps.now ?? Date.now;
  return { async command(raw: unknown) {
    let ctx: z.infer<typeof ctxSchema>;
    try { const parsed = ctxSchema.safeParse(await authorize()); if (!parsed.success) return { status: "forbidden" } as const; ctx = parsed.data; }
    catch { return { status: "forbidden" } as const; }
    const parsed = commandSchema.safeParse(raw);
    if (!parsed.success) return { status: "invalid_request" } as const;
    const req = parsed.data;
    const args: Record<string, unknown> = {};
    let expectedSnapshot: z.infer<typeof snapshotSchema> | undefined;
    if (req.command !== "recover") {
      if (req.command === "confirm") {
        const expires = Date.parse(req.expiresAt), time = now();
        if (!Number.isFinite(time) || expires <= time || expires > time + 600000) return { status: "invalid_request" } as const;
      }
      try {
        const intent = await load(ctx.workspaceId, req.intentId);
        if (!intent || intent.workspaceId !== ctx.workspaceId || intent.intentId !== req.intentId) return { status: "not_found" } as const;
        if (intent.status !== "pending" || intent.requiresCeoApproval !== true) return { status: "conflict" } as const;
        if (intent.payload.agentId !== intent.agentId || intent.payload.skillId !== intent.skillId
          || (req.command === "confirm" && hashExecutionIntentPayload(intent.payload) !== req.expectedPayloadHash)) return { status: "conflict" } as const;
        const action = Object.prototype.hasOwnProperty.call(TOOL_GOVERNED_ACTIONS, intent.toolName)
          ? TOOL_GOVERNED_ACTIONS[intent.toolName] : intent.toolName;
        // Recognition AND the current agent/skill licence policy are required.
        // No hypothetical ApprovedDecision is used to turn a BLOCK into approval.
        const advisory = guardGovernedAction({ agentId: intent.agentId, action, payloadHash: hashExecutionIntentPayload(intent.payload) }, () => { throw Error("producer_must_not_execute"); });
        const licence = evaluate({ agentId: intent.agentId, skillId: intent.skillId,
          autonomyLevel: intent.autonomyLevel, requestedMode: "live" });
        if (advisory.verdict !== "REQUIRE_APPROVAL" || !["ALLOW", "REQUIRE_APPROVAL"].includes(licence.outcome)) return { status: "blocked" } as const;
        expectedSnapshot = snapshotSchema.parse({ agentId: intent.agentId, skillId: intent.skillId,
          toolName: intent.toolName, autonomyLevel: intent.autonomyLevel, payload: intent.payload });
        const payloadJson = stableStringify(intent.payload as unknown as CanonicalJson);
        if (Buffer.byteLength(payloadJson, "utf8") > 64000) return { status: "invalid_request" } as const;
        // Bind the reviewed command context, not merely equal payloads on two intents.
        const expectedIntentHash = hashExecutionIntentPayload({ workspaceId: ctx.workspaceId,
          actorId: ctx.userId, intentId: intent.intentId, snapshot: expectedSnapshot });
        if (req.command === "review") return { status: "reviewed", review: { workspaceId: ctx.workspaceId,
          actorId: ctx.userId, intentId: intent.intentId, snapshot: expectedSnapshot,
          expectedPayloadHash: hashExecutionIntentPayload(intent.payload), expectedIntentHash, executionAuthorized: false } } as const;
        if (req.expectedIntentHash !== expectedIntentHash) return { status: "conflict" } as const;
        Object.assign(args, { p_payload_json: payloadJson, p_expected_snapshot: expectedSnapshot,
          p_confirmed: true, p_rationale: req.rationale, p_expires_at: req.expiresAt });
      } catch { return { status: "unavailable" } as const; }
    }
    Object.assign(args, { p_workspace_id: ctx.workspaceId, p_actor_id: ctx.userId,
      p_intent_id: req.intentId, p_request_id: req.requestId, p_payload_hash: req.expectedPayloadHash });
    let client: RpcClient | null;
    try { client = getClient(); } catch { return { status: "unavailable" } as const; }
    if (!client) return { status: "unavailable" } as const;
    // From this point a failed mutation response does NOT prove no effect.
    try {
      const { data, error } = req.command === "confirm"
        ? await client.rpc("create_approval_decision", args)
        : await client.rpc("classify_approval_decision", args);
      if (error) return { status: req.command === "confirm" ? "unconfirmed" : "unavailable" } as const;
      const result = req.command === "confirm"
        ? z.union([z.object({ status: z.enum(["created", "existing"]), decision: observationSchema }).strict(),
          z.object({ status: z.enum(["already_decided", "conflict", "not_found", "invalid_request"]) }).strict()]).safeParse(data)
        : z.union([observationSchema, z.object({ state: z.enum(["missing", "invalid"]) }).strict()]).safeParse(data);
      if (!result.success) return { status: req.command === "confirm" ? "unconfirmed" : "unavailable" } as const;
      const value = result.data;
      if ("status" in value && !("decision" in value)) return value;
      if ("state" in value && (value.state === "missing" || value.state === "invalid")) return { status: "reconciliation_required" } as const;
      const d = observationSchema.parse("decision" in value ? value.decision : value);
      const payload = JSON.parse(d.payloadJson);
      if (d.decisionId !== req.requestId || d.requestId !== req.requestId || d.workspaceId !== ctx.workspaceId
        || d.actorId !== ctx.userId || d.intentId !== req.intentId || d.payloadHash !== req.expectedPayloadHash
        || stableStringify(payload) !== d.payloadJson || hashExecutionIntentPayload(payload) !== d.payloadHash
        || stableStringify(d.intentSnapshot.payload as CanonicalJson) !== d.payloadJson
        || (expectedSnapshot && stableStringify(expectedSnapshot as unknown as CanonicalJson) !== stableStringify(d.intentSnapshot as CanonicalJson))
        || (req.command === "confirm" && (d.rationale !== req.rationale || Date.parse(d.expiresAt) !== Date.parse(req.expiresAt)))
        || (d.state === "approved" && Date.parse(d.expiresAt) <= now()))
        return { status: req.command === "confirm" ? "unconfirmed" : "unavailable" } as const;
      if ("status" in value && value.status === "created" && d.state !== "approved") return { status: "unconfirmed" } as const;
      return { status: "status" in value && value.status === "created" ? "recorded" : "observed", decision: d } as const;
    } catch { return { status: req.command === "confirm" ? "unconfirmed" : "unavailable" } as const; }
  } };
}
