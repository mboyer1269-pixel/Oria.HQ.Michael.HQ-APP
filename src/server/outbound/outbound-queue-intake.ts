// ---------------------------------------------------------------------------
// Outbound Queue Intake — builds an approved send candidate from CEO input
// ---------------------------------------------------------------------------
// Used by POST /api/outbound/queue (owner-gated). The caller IS the CEO:
// queuing through this path walks the batch lifecycle to `approved` and binds
// the approvalToken to the contentHash at intake time. Any later mutation of
// the content kills the token (enforced by the bridge).
//
// Pure module: node:crypto only. No network, no env, no store writes —
// the route registers the result.
// ---------------------------------------------------------------------------

import { createHash, randomUUID } from "node:crypto";
import type {
  AudienceType,
  ConsentBasis,
  Jurisdiction,
  OutboundAction,
  OutboundBatch,
  OutboundSubVoie,
} from "./outbound-types.ts";
import { approveBatch } from "./outbound-batch-approval.ts";
import type { OutboundChannelId } from "./outbound-channel.ts";
import type { OutboundSendCandidate } from "./outbound-send-store.ts";

export type OutboundQueueIntakeInput = {
  workspaceId: string;
  approverId: string;
  agentId?: string;
  ventureId?: string;
  channelId: OutboundChannelId;
  recipient: string;
  leadId: string;
  subject: string;
  body: string;
  subVoie: OutboundSubVoie;
  audienceType: AudienceType;
  consentBasis: ConsentBasis;
  jurisdiction?: Jurisdiction;
  aiDisclosure?: string;
  recipientLocalHour?: number | null;
  /** Send window duration in hours from intake (default 72h). */
  sendWindowHours?: number;
};

export type OutboundQueueIntakeResult =
  | { ok: true; candidate: OutboundSendCandidate; approvalToken: string }
  | { ok: false; reason: string };

export function computeOutboundContentHash(input: {
  subject: string;
  body: string;
  audienceType: AudienceType;
  jurisdiction: Jurisdiction;
  consentBasis: ConsentBasis;
  aiDisclosure: string;
}): string {
  // Mirrors the documented contract: hash(template + audienceType +
  // jurisdiction + consentBasis + aiDisclosure). Subject and body together
  // form the rendered template for single-send intake.
  return createHash("sha256")
    .update(
      [
        input.subject,
        input.body,
        input.audienceType,
        input.jurisdiction,
        input.consentBasis,
        input.aiDisclosure,
      ].join(" "),
    )
    .digest("hex");
}

export function buildApprovedSendCandidate(
  input: OutboundQueueIntakeInput,
): OutboundQueueIntakeResult {
  const now = new Date();
  const nowIso = now.toISOString();
  const jurisdiction = input.jurisdiction ?? "CA";
  const aiDisclosure = input.aiDisclosure ?? "Préparé avec l'assistance d'agents Oria HQ.";
  const sendWindowHours = input.sendWindowHours ?? 72;

  const subject = input.subject.trim();
  const body = input.body.trim();
  const recipient = input.recipient.trim();
  if (!subject || !body || !recipient) {
    return { ok: false, reason: "subject, body and recipient are required" };
  }

  const contentHash = computeOutboundContentHash({
    subject,
    body,
    audienceType: input.audienceType,
    jurisdiction,
    consentBasis: input.consentBasis,
    aiDisclosure,
  });

  const batchId = `ob_batch_${randomUUID()}`;
  const pending: OutboundBatch = {
    id: batchId,
    workspaceId: input.workspaceId,
    agentId: input.agentId ?? "agent_hermes",
    ...(input.ventureId ? { ventureId: input.ventureId } : {}),
    subVoie: input.subVoie,
    audienceType: input.audienceType,
    recipientCount: 1,
    messageTemplate: body,
    aiDisclosure,
    consentBasis: input.consentBasis,
    consentProvenance: [],
    unsubscribeMechanism: "present",
    jurisdiction,
    riskLevel: input.audienceType === "cold_prospect" ? "medium" : "low",
    approvalMode: "per_message",
    contentHash,
    sendWindow: {
      start: nowIso,
      end: new Date(now.getTime() + sendWindowHours * 3_600_000).toISOString(),
    },
    volumeCap: 1,
    state: "pending_approval",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const approval = approveBatch(pending, input.approverId);
  if (approval.decision !== "approved" || !approval.approvalToken) {
    return { ok: false, reason: approval.reason ?? "approval failed" };
  }

  const action: OutboundAction = {
    id: `ob_act_${randomUUID()}`,
    workspaceId: input.workspaceId,
    batchId,
    leadId: input.leadId,
    idempotencyKey: `${batchId}:${input.leadId}`,
    actionType: input.subVoie,
    renderedSubject: subject,
    renderedBody: body,
    personalizationSources: [],
    modelUsed: "ceo_manual_intake",
    costEstimateCents: 0,
    state: "queued",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    ok: true,
    approvalToken: approval.approvalToken,
    candidate: {
      batch: approval.batch,
      action,
      recipient,
      channelId: input.channelId,
      recipientLocalHour: input.recipientLocalHour ?? null,
    },
  };
}
