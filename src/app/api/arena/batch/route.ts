import { NextResponse } from "next/server";
import { getActiveWorkspaceContext } from "@/core/workspace-context";
import { requireOwnerApiSession } from "@/server/auth/owner";
import { arenaBatchRequestSchema } from "@/server/arena/arena-api-schema";
import { evaluateBatchAndMaybeStore } from "@/server/arena/arena-batch-service";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

type ArenaEvaluationService = typeof defaultArenaEvaluationService;

function getArenaEvaluationService(): ArenaEvaluationService {
  const globals = globalThis as typeof globalThis & {
    __arenaEvaluationServiceTestOverride?: ArenaEvaluationService;
  };

  return globals.__arenaEvaluationServiceTestOverride ?? defaultArenaEvaluationService;
}

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
}
