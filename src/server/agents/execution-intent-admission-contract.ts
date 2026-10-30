import { z } from "zod";
import { validateAgentExecutionIntent, type AgentExecutionIntent } from "@/features/agents/execution-intent";
import { hashExecutionIntentPayload } from "./execution-intent-payload-hash";
import { canonicalizeEntry, stableStringify, type CanonicalJson } from "@/server/ledger/hash-chain-canonicalizer";
import type { LedgerRowForChain } from "@/server/ledger/hash-chain-ledger-fields";

const uuid = z.uuid(), digest = z.string().regex(/^[a-f0-9]{64}$/), identity = z.string().min(1).max(200);
export const admissionReceiptSchema = z.object({ version: z.literal(1), workspaceId: identity, actorId: uuid,
  intentId: identity, decisionId: uuid, attemptId: uuid, payloadHash: digest, sourceHash: digest,
  ledgerId: uuid, ledgerHash: digest, admittedAt: z.iso.datetime({ offset: true }) }).strict();
export type AdmissionReceipt = z.infer<typeof admissionReceiptSchema>;
export type AdmissionSource = Pick<AgentExecutionIntent, "workspaceId" | "intentId" | "agentId" | "skillId" | "toolName" | "autonomyLevel" | "payload" | "requiresCeoApproval"> & { actorId: string };
export type AdmissionInput = { source: AdmissionSource; sourceJson: string; payloadJson: string;
  sourceHash: string; payloadHash: string; decisionId: string; attemptId: string };
export type AdmissionResult = { status: "admitted"; receipt: AdmissionReceipt }
  | { status: "invalid_request" | "unavailable" | "unconfirmed" | "conflict" | "approval_required" | "not_found" };
export type AdmissionPort = {
  admit(input: AdmissionInput): Promise<AdmissionResult>;
  /** Consumes a process-local fresh ACK ticket BEFORE current DB validation. Never grants on recovery. */
  takeCurrent(input: AdmissionInput, receipt: AdmissionReceipt): Promise<boolean>;
};

export function buildAdmissionInput(intent: AgentExecutionIntent, actorId: string, decisionId: string, attemptId: string): AdmissionInput {
  uuid.parse(actorId); uuid.parse(decisionId); uuid.parse(attemptId);
  identity.parse(intent.workspaceId); identity.parse(intent.intentId);
  if (!validateAgentExecutionIntent(intent).valid || intent.status !== "pending"
    || intent.payload.agentId !== intent.agentId || intent.payload.skillId !== intent.skillId) throw new Error("invalid admission source");
  const source: AdmissionSource = { workspaceId: intent.workspaceId, actorId, intentId: intent.intentId,
    agentId: intent.agentId, skillId: intent.skillId, toolName: intent.toolName, autonomyLevel: intent.autonomyLevel,
    payload: structuredClone(intent.payload), requiresCeoApproval: true };
  const payloadJson = stableStringify(source.payload as CanonicalJson), sourceJson = stableStringify(source as unknown as CanonicalJson);
  if (Buffer.byteLength(payloadJson) > 64_000 || Buffer.byteLength(sourceJson) > 70_000
    || stableStringify(JSON.parse(sourceJson)) !== sourceJson) throw new Error("invalid admission JSON");
  return { source, sourceJson, payloadJson, sourceHash: hashExecutionIntentPayload(source),
    payloadHash: hashExecutionIntentPayload(source.payload), decisionId, attemptId };
}
export function validAdmissionInput(i: AdmissionInput): boolean {
  try {
    const rebuilt = buildAdmissionInput({ ...i.source, status: "pending", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }, i.source.actorId, i.decisionId, i.attemptId);
    return rebuilt.sourceJson === i.sourceJson && rebuilt.payloadJson === i.payloadJson
      && rebuilt.sourceHash === i.sourceHash && rebuilt.payloadHash === i.payloadHash;
  } catch { return false; }
}
export function admissionMatches(i: AdmissionInput, r: AdmissionReceipt): boolean {
  return r.workspaceId === i.source.workspaceId && r.actorId === i.source.actorId && r.intentId === i.source.intentId
    && r.decisionId === i.decisionId && r.attemptId === i.attemptId && r.ledgerId === i.attemptId
    && r.payloadHash === i.payloadHash && r.sourceHash === i.sourceHash;
}
/** This is the owner's admission audit, NOT an agent licence or result. */
export function admissionLedgerRow(i: AdmissionInput): LedgerRowForChain {
  return { id: i.attemptId, workspace_id: i.source.workspaceId, user_id: i.source.actorId, agent_id: null,
    skill_id: null, mission_id: null, action_type: "execution_intent.owner_admitted", event_type: "action",
    summary: "Explicit owner admission recorded before one execution attempt", autonomy_level: 0, requires_confirmation: true,
    payload: {}, metadata: { version: 1, principal: "workspace_owner", phase: "attempt", intentId: i.source.intentId,
      decisionId: i.decisionId, attemptId: i.attemptId, approvedDigest: i.payloadHash, sourceHash: i.sourceHash,
      actualAgentId: i.source.agentId, actualSkillId: i.source.skillId, toolName: i.source.toolName }, created_at: new Date(0).toISOString() };
}
export function admissionLedgerContentMatches(i: AdmissionInput, row: LedgerRowForChain): boolean {
  return canonicalizeEntry(row) === canonicalizeEntry({ ...admissionLedgerRow(i), created_at: row.created_at });
}
