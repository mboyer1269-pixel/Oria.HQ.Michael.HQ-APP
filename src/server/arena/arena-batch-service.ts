import type { ArenaCandidate, ArenaEvaluationContext, ArenaVerdict } from "@/server/arena/roi-arena";
import { rankCandidates } from "@/server/arena/roi-arena";
import { defaultArenaEvaluationService } from "@/server/arena/arena-evaluation-service";

export class ArenaBatchServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArenaBatchServiceError";
  }
}

export type ArenaBatchInput = {
  workspaceId: string;
  candidates: ArenaCandidate[];
  context?: ArenaEvaluationContext;
  storeResults?: boolean;
  limit?: number;
};

export type ArenaBatchSummary = {
  total: number;
  evaluated: number;
  notEvaluable: number;
  stored: boolean;
  limit: number;
  topCandidateId: string | null;
  verdicts: ArenaVerdict[];
  generatedAt: string;
};

type BatchEvaluationServiceDeps = {
  evaluationService?: Pick<typeof defaultArenaEvaluationService, "evaluateAndStore">;
  now?: () => string;
};

const MAX_BATCH_SIZE = 100;
const DEFAULT_BATCH_LIMIT = 25;

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_BATCH_LIMIT;
  }

  if (!Number.isInteger(limit) || limit < 1) {
    throw new ArenaBatchServiceError("limit must be an integer between 1 and 100.");
  }

  if (limit > MAX_BATCH_SIZE) {
    throw new ArenaBatchServiceError("limit must not exceed 100.");
  }

  return limit;
}

function validateBatchInput(input: ArenaBatchInput): void {
  if (!input.workspaceId || typeof input.workspaceId !== "string") {
    throw new ArenaBatchServiceError("workspaceId is required.");
  }

  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    throw new ArenaBatchServiceError("candidates must contain at least one item.");
  }

  if (input.candidates.length > MAX_BATCH_SIZE) {
    throw new ArenaBatchServiceError("candidates must not exceed 100 items.");
  }

  normalizeLimit(input.limit);
}

function normalizeCandidates(workspaceId: string, candidates: ArenaCandidate[]): ArenaCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    workspaceId,
  }));
}

export function evaluateBatch(
  input: ArenaBatchInput,
  deps: BatchEvaluationServiceDeps = {},
): ArenaBatchSummary {
  validateBatchInput(input);

  const limit = normalizeLimit(input.limit);
  const normalizedCandidates = normalizeCandidates(input.workspaceId, input.candidates);
  const verdicts = rankCandidates(normalizedCandidates, input.context);
  const limitedVerdicts = verdicts.slice(0, limit);
  const notEvaluable = verdicts.filter((verdict) => verdict.decision === "not-evaluable").length;

  return {
    total: normalizedCandidates.length,
    evaluated: normalizedCandidates.length,
    notEvaluable,
    stored: false,
    limit,
    topCandidateId: limitedVerdicts[0]?.candidateId ?? null,
    verdicts: limitedVerdicts,
    generatedAt: deps.now?.() ?? new Date().toISOString(),
  };
}

export async function evaluateBatchAndMaybeStore(
  input: ArenaBatchInput,
  deps: BatchEvaluationServiceDeps = {},
): Promise<ArenaBatchSummary> {
  validateBatchInput(input);

  const limit = normalizeLimit(input.limit);
  const normalizedCandidates = normalizeCandidates(input.workspaceId, input.candidates);
  const evaluationService = deps.evaluationService ?? defaultArenaEvaluationService;
  const storeResults = input.storeResults ?? true;

  if (storeResults) {
    for (const candidate of normalizedCandidates) {
      await evaluationService.evaluateAndStore(candidate, input.context);
    }
  }

  const verdicts = rankCandidates(normalizedCandidates, input.context);
  const limitedVerdicts = verdicts.slice(0, limit);
  const notEvaluable = verdicts.filter((verdict) => verdict.decision === "not-evaluable").length;

  return {
    total: normalizedCandidates.length,
    evaluated: normalizedCandidates.length,
    notEvaluable,
    stored: storeResults,
    limit,
    topCandidateId: limitedVerdicts[0]?.candidateId ?? null,
    verdicts: limitedVerdicts,
    generatedAt: deps.now?.() ?? new Date().toISOString(),
  };
}
