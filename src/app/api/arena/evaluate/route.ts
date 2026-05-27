import { NextResponse } from "next/server";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { arenaEvaluateRequestSchema } from "@/server/arena/arena-api-schema";
import { getArenaEvaluationService } from "@/server/arena/get-arena-service";

// POST /api/arena/evaluate
// Evaluates a candidate, stores the verdict in memory, and persists to DB.
// workspaceId is always resolved server-side -- client-supplied value is overridden.
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

  try {
    const candidate = { ...parsed.data.candidate, workspaceId: activeWorkspace.id };
    const record = await getArenaEvaluationService().evaluateAndStore(
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
  } catch (error) {
    console.error("POST /api/arena/evaluate failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Arena evaluation failed." }, { status: 500 });
  }
}
