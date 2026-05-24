import { NextResponse } from "next/server";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";
import { arenaEvaluateRequestSchema } from "@/server/arena/arena-api-schema";

// POST /api/arena/evaluate
// Evaluates a candidate and stores the verdict in the process-scoped in-memory store.
// No DB writes, no effects, no execution.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = arenaEvaluateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const record = defaultArenaEvaluationService.evaluateAndStore(
    parsed.data.candidate,
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
