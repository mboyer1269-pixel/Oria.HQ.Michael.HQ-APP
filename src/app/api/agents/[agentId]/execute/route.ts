import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { evaluateLiveExecution } from "@/server/runtime/execution-guard";
import { dispatchSkillExecution } from "@/server/runtime/skill-dispatcher";
import { createAgentOutcome } from "@/server/ventures/agent-outcome-repository";
import { logger } from "@/lib/logger";

/**
 * POST /api/agents/:agentId/execute
 *
 * Green Lane Execute -- PR5
 *
 * The HTTP surface for live agent skill execution. Every request passes
 * through the Sentinelle Policy Engine (evaluateLiveExecution) before any
 * side effect can occur.
 *
 * Flow:
 *   1. Auth check (requireOwnerApiSession)
 *   2. Parse and validate request body
 *   3. Sentinelle gate (evaluateLiveExecution)
 *      - ALLOW    -> dispatch to skill executor, record outcome
 *      - REQUIRE_APPROVAL -> return 202 with approval_required flag
 *      - BLOCK    -> return 403
 *   4. Record AgentOutcome (pending) regardless of dispatch result
 *   5. Return result to caller
 *
 * Safety:
 *   - clientApprovalConfirmed is always rejected by the guard.
 *   - No action executes without ALLOW from Sentinelle.
 *   - Every action is recorded in agent_outcomes.
 */

const executeRequestSchema = z.object({
  skillId: z.string().min(1).max(120),
  autonomyLevel: z.number().int().min(0).max(5).default(2),
  ventureId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  const { agentId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = executeRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid execute request.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { skillId, autonomyLevel, ventureId, input } = parsed.data;
  const ctx = getActiveWorkspaceContext();
  const proposedAt = new Date().toISOString();

  // ── Sentinelle gate ────────────────────────────────────────────────────────
  const sentinelle = evaluateLiveExecution({
    agentId,
    skillId,
    requestedMode: "live",
    autonomyLevel,
  });

  if (sentinelle.outcome === "BLOCK") {
    logger.warn("agent.execute.blocked", {
      agentId, skillId, reason: sentinelle.reason, workspaceId: ctx.workspace.id,
    });
    return NextResponse.json(
      {
        outcome: "BLOCK",
        zone: sentinelle.zone,
        reason: sentinelle.reason,
        agentId,
        skillId,
      },
      { status: 403 },
    );
  }

  if (sentinelle.outcome === "REQUIRE_APPROVAL") {
    // Record as pending -- CEO will approve via review queue
    await createAgentOutcome({
      workspaceId: ctx.workspace.id,
      createdByUserId: ctx.userId,
      agentId,
      skillId,
      ventureId,
      proposedAt,
      outcome: "pending",
    }).catch((err) => {
      logger.warn("agent.execute.outcome.record.failed", {
        agentId, skillId, reason: err instanceof Error ? err.message : "unknown",
      });
    });

    return NextResponse.json(
      {
        outcome: "REQUIRE_APPROVAL",
        zone: "yellow",
        reason: sentinelle.reason,
        agentId,
        skillId,
        requiresHumanApproval: true,
      },
      { status: 202 },
    );
  }

  // ── ALLOW: dispatch to skill executor ─────────────────────────────────────
  const executedAt = new Date().toISOString();
  let dispatchResult: Awaited<ReturnType<typeof dispatchSkillExecution>>;

  try {
    dispatchResult = await dispatchSkillExecution({
      agentId,
      skillId,
      input,
      workspaceId: ctx.workspace.id,
    });
  } catch (err) {
    logger.error("agent.execute.dispatch.failed", {
      agentId, skillId, reason: err instanceof Error ? err.message : "unknown",
    });

    // Record as failed
    await createAgentOutcome({
      workspaceId: ctx.workspace.id,
      createdByUserId: ctx.userId,
      agentId,
      skillId,
      ventureId,
      proposedAt,
      executedAt,
      outcome: "failed",
    }).catch(() => void 0);

    return NextResponse.json(
      { error: "Skill dispatch failed.", agentId, skillId },
      { status: 500 },
    );
  }

  // Record as pending (CEO evaluates outcome later)
  const outcomeRecord = await createAgentOutcome({
    workspaceId: ctx.workspace.id,
    createdByUserId: ctx.userId,
    agentId,
    skillId,
    ventureId,
    actionRef: dispatchResult.actionRef,
    proposedAt,
    executedAt,
    outcome: "pending",
  }).catch((err) => {
    logger.warn("agent.execute.outcome.record.failed", {
      agentId, skillId, reason: err instanceof Error ? err.message : "unknown",
    });
    return null;
  });

  logger.info("agent.execute.success", {
    agentId, skillId, zone: "green", workspaceId: ctx.workspace.id,
    outcomeId: outcomeRecord?.id,
  });

  return NextResponse.json({
    outcome: "ALLOW",
    zone: "green",
    agentId,
    skillId,
    executedAt,
    result: dispatchResult.result,
    actionRef: dispatchResult.actionRef,
    outcomeId: outcomeRecord?.id,
    requiresLedger: sentinelle.requiresLedger,
    requiresSentinel: sentinelle.requiresSentinel,
  });
}
