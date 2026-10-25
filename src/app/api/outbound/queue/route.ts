import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOutboundOwnerContext } from "@/server/outbound/outbound-route-auth";
import { buildClientSendCandidate } from "@/server/outbound/outbound-queue-intake";
import {
  listOutboundSendCandidates,
  registerOutboundSendCandidate,
  getOutboundOutcome,
} from "@/server/outbound/outbound-send-store";

// /api/outbound/queue — Send Desk queue intake + listing (owner-gated).
//
// POST queues ONE fully-rendered message as an approved `ceo_single_send`
// candidate. The owner is the approver: the approvalToken is bound to the
// contentHash at intake. GET lists the workspace queue with send status.
//
// See docs/REVENUE_EXECUTION_LANE.md §3.1.

const queueRequestSchema = z.object({
  channelId: z.enum(["email", "sms"]),
  recipient: z.string().min(3),
  leadId: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  subVoie: z.enum(["reply_assist", "follow_up", "re_activation", "cold_email"]),
  audienceType: z.enum(["internal_test", "known_contact", "warm_lead", "cold_prospect"]),
  consentBasis: z.enum(["express", "implied_verified", "manual_review_required", "unknown"]),
  consentProvenance: z.array(z.object({
    kind: z.enum(["stripe_charge", "signed_loi", "email_reply", "analytics_event", "screenshot", "manual_note", "self_reported"]),
    referenceId: z.string().min(1),
    source: z.string().min(1),
    capturedAt: z.iso.datetime(),
    summary: z.string().min(1),
    isVerified: z.boolean(),
    provenance: z.literal("simulated").optional(),
  })).optional(),
  ventureId: z.string().optional(),
  recipientLocalHour: z.number().int().min(0).max(23).nullable().optional(),
});

export async function POST(request: Request) {
  const ctx = await requireOutboundOwnerContext(request);
  if (ctx instanceof NextResponse) return ctx;

  const body = await request.json().catch(() => null);
  const parsed = queueRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const built = buildClientSendCandidate({
    ...parsed.data,
    workspaceId: ctx.workspaceId,
    approverId: ctx.approverId,
  });

  if (!built.ok) {
    return NextResponse.json({ error: built.reason }, { status: 422 });
  }

  registerOutboundSendCandidate(built.candidate);

  return NextResponse.json(
    {
      actionId: built.candidate.action.id,
      batchId: built.candidate.batch.id,
      approvalToken: built.approvalToken,
      state: built.candidate.batch.state,
    },
    { status: 201 },
  );
}

export async function GET(request?: Request) {
  const ctx = await requireOutboundOwnerContext(request);
  if (ctx instanceof NextResponse) return ctx;
  const candidates = listOutboundSendCandidates(ctx.workspaceId);

  return NextResponse.json({
    candidates: candidates.map((candidate) => ({
      actionId: candidate.action.id,
      channelId: candidate.channelId,
      recipient: candidate.recipient,
      subject: candidate.action.renderedSubject,
      state: candidate.batch.state,
      outcome: getOutboundOutcome(candidate.action.idempotencyKey),
    })),
  });
}
