import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { arenaBatchRequestSchema } from "@/server/arena/arena-api-schema";
import { evaluateBatchAndMaybeStore } from "@/server/arena/arena-batch-service";
import { getArenaEvaluationService } from "@/server/arena/get-arena-service";

// POST /api/arena/batch
export async function POST(request: Request) {
  const authError = await requireOwnerApiSession();
  if (authError) return authError;

  const { activeWorkspace } = getActiveWorkspaceContext();
  const body = await request.json().catch(() => null);
  const parsed = arenaBatchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await evaluateBatchAndMaybeStore(
      {
        workspaceId: activeWorkspace.id,
        candidates: parsed.data.candidates,
        context: parsed.data.context,
        storeResults: parsed.data.storeResults,
        limit: parsed.data.limit,
      },
      { evaluationService: getArenaEvaluationService() },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("POST /api/arena/batch failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Arena batch evaluation failed." }, { status: 500 });
  }
}
