import { NextResponse } from "next/server";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

// GET /api/arena/verdicts
// Returns all non-expired verdicts from the process-scoped in-memory store.
// No DB reads, no side effects.
export async function GET() {
  const records = defaultArenaEvaluationService.listVerdicts();
  return NextResponse.json({ verdicts: records, total: records.length });
}
