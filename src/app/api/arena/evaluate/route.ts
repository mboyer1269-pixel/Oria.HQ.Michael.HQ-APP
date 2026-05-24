import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";
import { arenaEvaluateRequestSchema } from "@/server/arena/arena-api-schema";

// POST /api/arena/evaluate
// Evaluates a candidate, stores the verdict in memory, and persists to DB.
// workspaceId is always resolved server-side — client-supplied value is overridden.
export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace } = getActiveWorkspaceContext();

  const body = await request.json().catch(() => null);
  const parsed = arenaEvaluateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const candidate = { ...parsed.data.candidate, workspaceId: activeWorkspace.id };
  const record = await defaultArenaEvaluationService.evaluateAndStore(
    candidate,
    parsed.data.context,
  );

  return NextResponse.json(
    {
      candidateId: record.candidateId,
      verdict: record.verdict,
      storedAt: record.storedAt,
      expiresAt: record.expiresAt,
    },
    { status: 200 },
  );
}
