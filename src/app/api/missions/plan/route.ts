import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import {
  buildDryRunMissionExecutionPlan,
  listMissionsForWorkspace,
} from "@/server/missions";
import { deriveMissionApprovalConfirmation } from "@/server/missions/approval-derivation";
import { checkExecutionAttempt, recordAttempt } from "@/server/missions/execution-attempt-store";

/**
 * POST /api/missions/plan
 *
 * Dry-run only. Returns the execution plan for a mission without executing it.
 *
 * Safety guarantees:
 *   - No execution — buildDryRunMissionExecutionPlan() hard-blocks mode "live"
 *   - No ledger.record() calls
 *   - No DB writes
 *   - approvalConfirmed is never accepted from the caller — derived server-side only
 *   - Mission resolved server-side from workspace context — caller cannot inject a mission
 *   - Idempotency key required — duplicate requests within TTL are rejected
 *   - Rate limit enforced — max 10 attempts / 60s per workspace
 *
 * Request body:
 *   { missionId: string; idempotencyKey: string }
 *
 * Responses:
 *   200 { allowed: true,  plan, approvalEvaluation, transitionEvaluation }
 *   200 { allowed: false, blockReasons, approvalEvaluation, transitionEvaluation }
 *   400 missing or invalid body fields
 *   401 unauthenticated
 *   403 not owner
 *   404 mission not found in active workspace
 *   409 duplicate idempotency key
 *   429 rate limit exceeded
 *   500 internal error
 */
export async function POST(request: NextRequest) {
  // Auth gate — owner session required
  const authResponse = await requireOwnerApiSession();
  if (authResponse) return authResponse;

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  const { missionId, idempotencyKey } = body as Record<string, unknown>;

  if (typeof missionId !== "string" || missionId.trim() === "") {
    return NextResponse.json({ error: "missionId requis." }, { status: 400 });
  }

  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    return NextResponse.json({ error: "idempotencyKey requis." }, { status: 400 });
  }

  // Resolve workspace server-side — caller cannot inject workspace or mission data
  const { activeWorkspace, activeMode } = getActiveWorkspaceContext();

  // Resolve mission from the active workspace — rejects cross-workspace access
  const { missions } = await listMissionsForWorkspace({
    workspaceId: activeWorkspace.id,
    modeId: activeMode.id,
  });

  const mission = missions.find((m) => m.id === missionId);

  if (!mission) {
    return NextResponse.json(
      { error: "Mission introuvable dans cet espace de travail." },
      { status: 404 },
    );
  }

  // Idempotency + rate limit check
  const attemptInput = {
    missionId: mission.id,
    workspaceId: activeWorkspace.id,
    idempotencyKey,
  };

  const attemptCheck = checkExecutionAttempt(attemptInput);

  if (!attemptCheck.allowed) {
    if (attemptCheck.reason === "duplicate_key") {
      return NextResponse.json(
        { error: "Requête dupliquée — même clé d'idempotence déjà reçue." },
        { status: 409 },
      );
    }
    if (attemptCheck.reason === "rate_limit_exceeded") {
      return NextResponse.json(
        { error: "Limite de fréquence atteinte. Réessayez dans quelques secondes." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "Tentative d'exécution invalide." },
      { status: 400 },
    );
  }

  // Reserve the idempotency key before plan generation.
  // This closes the window where two concurrent requests with the same key
  // could both pass checkExecutionAttempt() before either calls recordAttempt().
  // If buildDryRunMissionExecutionPlan() throws after this point, the key is
  // consumed — acceptable for a planning endpoint where safety > retry convenience.
  recordAttempt(attemptInput);

  // approvalConfirmed is NEVER accepted from the caller.
  // It is derived server-side from a verified MissionApprovalRecord.
  // Until mission_approval_records persistence is live (PR #19C sign-off required),
  // this is always false — any mission requiring approval will return allowed: false.
  const approvalDerivation = deriveMissionApprovalConfirmation(mission, null);

  // Build dry-run plan — no execution, no writes, no AI calls, no ledger.record()
  let result: ReturnType<typeof buildDryRunMissionExecutionPlan>;
  try {
    result = buildDryRunMissionExecutionPlan({
      mission,
      mode: "dry_run",
      approvalDerivation,
    });
  } catch (error) {
    console.error(
      "POST /api/missions/plan — buildDryRunMissionExecutionPlan failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json({ error: "Erreur interne lors de l'évaluation du plan." }, { status: 500 });
  }

  return NextResponse.json(result);
}
