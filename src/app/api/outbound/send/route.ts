import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { sendOutboundActionAsCeo } from "@/server/outbound/outbound-send-service";
import { createOutboundLedgerWriter } from "@/server/outbound/outbound-ledger";
import {
  createResendEmailAdapterFromEnv,
  ResendAdapterConfigError,
} from "@/server/outbound/resend-email-adapter-env";

// POST /api/outbound/send — `ceo_single_send`
//
// The Send Desk button. Owner-gated. ONE action per call; no batch body is
// accepted. The server resolves the candidate (batch + action + recipient)
// from the outbound send store — the client supplies only the actionId and
// the approvalToken it was shown. workspaceId is resolved server-side.
//
// See docs/REVENUE_EXECUTION_LANE.md §3.1 and docs/DECISION_LOG.md 2026-06-10.

const sendRequestSchema = z.object({
  actionId: z.string().min(1),
  approvalToken: z.string().min(1),
});

export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const ctx = getActiveWorkspaceContext();

  const body = await request.json().catch(() => null);
  const parsed = sendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let channelSend;
  try {
    channelSend = createResendEmailAdapterFromEnv();
  } catch (error) {
    if (error instanceof ResendAdapterConfigError) {
      return NextResponse.json(
        { error: "Send Desk is not configured (missing email provider env)." },
        { status: 503 },
      );
    }
    throw error;
  }

  try {
    const outcome = await sendOutboundActionAsCeo(
      {
        workspaceId: ctx.workspace.id,
        actionId: parsed.data.actionId,
        approvalToken: parsed.data.approvalToken,
      },
      {
        channelSend,
        ledger: createOutboundLedgerWriter(ctx),
      },
    );

    if (outcome.kind === "not_found") {
      return NextResponse.json({ error: "Outbound action not found." }, { status: 404 });
    }
    if (outcome.kind === "token_mismatch") {
      return NextResponse.json(
        { error: "approvalToken does not match the approved content." },
        { status: 409 },
      );
    }

    const { result } = outcome;
    if (result.status === "blocked") {
      return NextResponse.json(
        { status: "blocked", blockReason: result.blockReason, blockCodes: result.blockCodes },
        { status: 422 },
      );
    }
    if (result.status === "failed") {
      return NextResponse.json(
        {
          status: "failed",
          errorCode: result.errorCode,
          retryable: result.retryable,
          ledgerEventId: result.ledgerEventId,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        status: "sent",
        alreadySent: result.alreadySent,
        actionId: result.actionId,
        providerMessageId: result.providerMessageId,
        ledgerEventId: result.ledgerEventId,
        sentAt: result.sentAt,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      "POST /api/outbound/send failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "Outbound send failed." }, { status: 500 });
  }
}
