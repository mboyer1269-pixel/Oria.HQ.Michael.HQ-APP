"use server";

// src/features/ventures/loi96-pipeline-action.ts
//
// P1 — Le Pont. Owner-gated server actions wiring the Loi 96 pipeline to the
// Send Desk:
//   prepare → buildLoi96AuditEmail → approved send candidate → /hq/outbound
//   (the CEO click in the Send Desk remains the ONLY trigger that sends).
//
// Status flow on the target is file-backed (pipeline.json, versioned). The
// live send status is joined at read time from the outbound store — single
// source of truth per concern, no double bookkeeping.

import { getDefaultWorkspace } from "@/core/workspaces/registry";
import { requireOwnerAccess } from "@/server/auth/owner";
import {
  loadLoi96Pipeline,
  updateLoi96Target,
  type Loi96Target,
} from "@/server/ventures/loi96-target-store";
import { buildLoi96AuditEmail } from "@/server/ventures/loi96-audit-email";
import { buildApprovedSendCandidate } from "@/server/outbound/outbound-queue-intake";
import {
  getOutboundOutcome,
  getOutboundSendCandidate,
  registerOutboundSendCandidate,
} from "@/server/outbound/outbound-send-store";

export type Loi96BoardTarget = Loi96Target & {
  /** Joined live state from the Send Desk (read-time, never stored twice). */
  liveStatus: "none" | "queued" | "sent" | "failed" | "blocked";
};

async function resolveOwnerWorkspaceId(): Promise<string | null> {
  const access = await requireOwnerAccess("/hq/ventures/loi96");
  if (access.status === "forbidden") return null;
  return getDefaultWorkspace({ ownerUserId: access.user.id }).id;
}

export async function listLoi96BoardAction(): Promise<
  | { status: "ok"; targets: Loi96BoardTarget[]; weeklyGoal: string; killMetrics: string[] }
  | { status: "forbidden" }
  | { status: "missing" }
> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  const pipeline = loadLoi96Pipeline();
  if (!pipeline) return { status: "missing" };

  const targets: Loi96BoardTarget[] = pipeline.targets.map((target) => {
    let liveStatus: Loi96BoardTarget["liveStatus"] = "none";
    if (target.outboundActionId) {
      const candidate = getOutboundSendCandidate(workspaceId, target.outboundActionId);
      if (candidate) {
        const outcome = getOutboundOutcome(candidate.action.idempotencyKey);
        liveStatus = outcome ? outcome.status : "queued";
        // Read-time reconciliation: a confirmed send promotes the file status.
        if (outcome?.status === "sent" && target.status !== "sent" && target.status !== "replied") {
          updateLoi96Target(target.domain, {
            status: "sent",
            sentDate: outcome.sentAt.slice(0, 10),
          });
          target.status = "sent";
          target.sentDate = outcome.sentAt.slice(0, 10);
        }
      }
    }
    return { ...target, liveStatus };
  });

  return {
    status: "ok",
    targets,
    weeklyGoal: `${pipeline.weeklyGoal.auditsSent} ${pipeline.weeklyGoal.label}`,
    killMetrics: pipeline.killMetrics,
  };
}

export type Loi96PrepareResult =
  | { status: "queued"; actionId: string }
  | { status: "error"; message: string }
  | { status: "forbidden" };

/**
 * « Préparer » : builds the audit-offer email and queues it in the Send Desk
 * as an approved `ceo_single_send` candidate. NOTHING is sent here — the CEO
 * reviews the full message in /hq/outbound and clicks.
 */
export async function prepareLoi96AuditAction(input: {
  domain: string;
}): Promise<Loi96PrepareResult> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };

  const pipeline = loadLoi96Pipeline();
  const target = pipeline?.targets.find((candidate) => candidate.domain === input.domain);
  if (!target) return { status: "error", message: `Cible inconnue : ${input.domain}` };

  const recipient = target.contact?.includes("@") ? target.contact : null;
  if (!recipient) {
    return {
      status: "error",
      message: "Pas de courriel direct pour cette cible — ajoute un contact courriel d'abord.",
    };
  }
  if (target.outboundActionId) {
    return { status: "error", message: "Déjà dans la file d'envoi (voir Send Desk)." };
  }

  const email = buildLoi96AuditEmail(target);
  const access = await requireOwnerAccess("/hq/ventures/loi96");
  if (access.status === "forbidden") return { status: "forbidden" };

  const built = buildApprovedSendCandidate({
    workspaceId,
    approverId: access.user.id,
    agentId: "hermes",
    ventureId: "loi96",
    channelId: "email",
    recipient,
    leadId: target.domain,
    subject: email.subject,
    body: email.body,
    subVoie: "cold_email",
    audienceType: "cold_prospect",
    consentBasis: "implied_verified",
    recipientLocalHour: new Date().getHours(),
  });
  if (!built.ok) return { status: "error", message: built.reason };

  registerOutboundSendCandidate(built.candidate);
  updateLoi96Target(target.domain, {
    status: "queued",
    outboundActionId: built.candidate.action.id,
  });

  return { status: "queued", actionId: built.candidate.action.id };
}

export async function markLoi96ReplyAction(input: {
  domain: string;
}): Promise<{ status: "saved" } | { status: "error"; message: string } | { status: "forbidden" }> {
  const workspaceId = await resolveOwnerWorkspaceId();
  if (!workspaceId) return { status: "forbidden" };
  const result = updateLoi96Target(input.domain, {
    status: "replied",
    replyDate: new Date().toISOString().slice(0, 10),
  });
  return result.ok ? { status: "saved" } : { status: "error", message: result.reason };
}
