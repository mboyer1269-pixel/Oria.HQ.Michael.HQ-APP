import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import { n8nWebhookPayloadSchema, N8N_WEBHOOK_TRIGGER_TOOL_NAME } from "@/server/agents/tools";
import { buildAgentExecutionIntent } from "@/features/agents/execution-intent";
import {
  createAgentExecutionIntent,
  listPendingAgentExecutionIntents,
} from "@/server/agents/execution-intent-repository";
import { logger } from "@/lib/logger";

/**
 * POST /api/agents/:agentId/execution-intents   (preparation -- NO network call)
 * GET  /api/agents/:agentId/execution-intents   (list pending for the agent)
 *
 * The preparation half of the corrected n8n rail. Hermès (Relay) produces a
 * strict n8n payload and queues it as a PENDING execution intent. The Sentinelle
 * is consulted for eligibility only: a hard BLOCK is rejected here; ALLOW or
 * REQUIRE_APPROVAL both mean "eligible for CEO approval" -- NOT "fire". No
 * external call happens on this path. The n8n webhook is fired only by the
 * separate CEO approval route.
 */

const createIntentSchema = z
  .object({
    skillId: z.string().min(1).max(120),
    autonomyLevel: z.number().int().min(0).max(5).default(2),
    client: z.string().min(1),
    email: z.string().email(),
    actionType: z.string().min(1),
    missionId: z.string().min(1),
    ventureId: z.string().min(1).optional(),
    data: z.record(z.string(), z.unknown()).optional().default({}),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { agentId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = createIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid execution intent request.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { skillId, autonomyLevel, client, email, actionType, missionId, ventureId, data } =
    parsed.data;
  const ctx = getActiveWorkspaceContext();

  // Sentinelle eligibility: a hard BLOCK never becomes a queued intent.
  const sentinelle = evaluateLiveExecution({ agentId, skillId, requestedMode: "live", autonomyLevel });
  if (sentinelle.outcome === "BLOCK") {
    logger.warn("agent.execution-intent.blocked", {
      agentId,
      skillId,
      reason: sentinelle.reason,
      workspaceId: ctx.workspace.id,
    });
    return NextResponse.json(
      { outcome: "BLOCK", zone: sentinelle.zone, reason: sentinelle.reason, agentId, skillId },
      { status: 403 },
    );
  }

  // Validate the dispatchable payload up front so a stored intent is always
  // well-formed for the n8n tool.
  const payloadCheck = n8nWebhookPayloadSchema.safeParse({
    agentId,
    skillId,
    client,
    email,
    actionType,
    missionId,
    ...(ventureId ? { ventureId } : {}),
    data,
  });
  if (!payloadCheck.success) {
    return NextResponse.json(
      { error: "Invalid n8n payload.", issues: payloadCheck.error.flatten() },
      { status: 400 },
    );
  }

  const createdAt = new Date().toISOString();
  const intentId = `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const intent = buildAgentExecutionIntent({
    intentId,
    workspaceId: ctx.workspace.id,
    agentId,
    skillId,
    toolName: N8N_WEBHOOK_TRIGGER_TOOL_NAME,
    autonomyLevel,
    payload: payloadCheck.data,
    createdAt,
  });

  let stored;
  try {
    stored = await createAgentExecutionIntent(ctx.workspace.id, ctx.userId, intent);
  } catch (err) {
    logger.error("agent.execution-intent.create.failed", {
      agentId,
      skillId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "Failed to queue execution intent." }, { status: 500 });
  }

  // Ledger: record that the action is eligible and queued for CEO approval.
  await recordLedgerEvent(ctx, {
    eventType: "decision",
    actionType: skillId,
    summary: `Execution intent ${intentId} queued for CEO approval (${actionType}).`,
    autonomyLevel,
    requiresConfirmation: true,
    workspaceId: ctx.workspace.id,
    skillId,
    agentId,
    ...(missionId ? { missionId } : {}),
    effect: { kind: "runtime_result", operation: "plan", target: "agent_execution_intent" },
    metadata: {
      phase: "eligible_for_approval",
      intentId,
      toolName: N8N_WEBHOOK_TRIGGER_TOOL_NAME,
      actionType,
    },
  }).catch((err) => {
    logger.warn("agent.execution-intent.ledger.failed", {
      agentId,
      skillId,
      reason: err instanceof Error ? err.message : "unknown",
    });
  });

  return NextResponse.json(
    {
      intentId: stored.intentId,
      status: stored.status,
      outcome: sentinelle.outcome,
      requiresHumanApproval: true,
      agentId,
      skillId,
    },
    { status: 201 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { agentId } = await params;
  const ctx = getActiveWorkspaceContext();

  const pending = (await listPendingAgentExecutionIntents(ctx.workspace.id)).filter(
    (intent) => intent.agentId === agentId,
  );

  return NextResponse.json({ agentId, intents: pending });
}
