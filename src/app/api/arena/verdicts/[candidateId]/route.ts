import { NextResponse } from "next/server";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

// GET /api/arena/verdicts/[candidateId]
// Returns a specific verdict by candidateId, or 404 if absent or expired.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;

  if (!candidateId || typeof candidateId !== "string") {
    return NextResponse.json({ error: "candidateId is required." }, { status: 400 });
  }

  const record = defaultArenaEvaluationService.getVerdict(candidateId);

  if (!record) {
    return NextResponse.json(
      { error: `No verdict found for candidateId: ${candidateId}` },
      { status: 404 },
    );
  }

  return NextResponse.json(record);
}
