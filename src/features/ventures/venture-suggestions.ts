import type { VentureScore } from "./types";

export type VentureCandidateSuggestion = {
  id: string;
  name: string;
  description: string;
  targetCustomer: string;
  problem: string;
  offer: string;
  primaryChannel: string;
  source: "simulated" | "future_agent";
  suggestedBy: string;
  rationale: string;
  estimatedScore?: VentureScore;
  estimatedCostToValidateCents?: number;
  estimatedTimeToFirstDollarDays?: number;
  riskNotes: string[];
  suggestedNextAction: "review" | "score" | "reject" | "save_later";
  createdAt: string;
};

export type VentureSuggestionInboxSummary = {
  totalCount: number;
  visibleCount: number;
  simulatedCount: number;
  futureAgentCount: number;
  byNextAction: Record<VentureCandidateSuggestion["suggestedNextAction"], number>;
  bySource: Record<VentureCandidateSuggestion["source"], number>;
  estimatedScoreCount: number;
  averageEstimatedScore: number | null;
  rankedSuggestions: VentureCandidateSuggestion[];
};

const VISIBLE_SUGGESTION_LIMIT = 6;

const NEXT_ACTION_PRIORITY: Record<VentureCandidateSuggestion["suggestedNextAction"], number> = {
  review: 0,
  score: 1,
  save_later: 2,
  reject: 3,
};

function compareSuggestions(
  left: VentureCandidateSuggestion,
  right: VentureCandidateSuggestion,
): number {
  const actionDelta =
    NEXT_ACTION_PRIORITY[left.suggestedNextAction] - NEXT_ACTION_PRIORITY[right.suggestedNextAction];
  if (actionDelta !== 0) return actionDelta;

  const leftScore = left.estimatedScore?.overallScore ?? -1;
  const rightScore = right.estimatedScore?.overallScore ?? -1;
  const scoreDelta = rightScore - leftScore;
  if (scoreDelta !== 0) return scoreDelta;

  const createdAtDelta = left.createdAt.localeCompare(right.createdAt);
  if (createdAtDelta !== 0) return createdAtDelta;

  return left.name.localeCompare(right.name);
}

export function getVisibleSuggestionLimit(): number {
  return VISIBLE_SUGGESTION_LIMIT;
}

export function rankVentureSuggestions(
  suggestions: VentureCandidateSuggestion[],
): VentureCandidateSuggestion[] {
  return [...suggestions].sort(compareSuggestions);
}

export function summarizeSuggestionInbox(
  suggestions: VentureCandidateSuggestion[],
): VentureSuggestionInboxSummary {
  const rankedSuggestions = rankVentureSuggestions(suggestions);
  const byNextAction: Record<VentureCandidateSuggestion["suggestedNextAction"], number> = {
    review: 0,
    score: 0,
    reject: 0,
    save_later: 0,
  };
  const bySource: Record<VentureCandidateSuggestion["source"], number> = {
    simulated: 0,
    future_agent: 0,
  };

  let estimatedScoreCount = 0;
  let estimatedScoreTotal = 0;

  for (const suggestion of suggestions) {
    byNextAction[suggestion.suggestedNextAction] += 1;
    bySource[suggestion.source] += 1;
    if (suggestion.estimatedScore) {
      estimatedScoreCount += 1;
      estimatedScoreTotal += suggestion.estimatedScore.overallScore;
    }
  }

  return {
    totalCount: suggestions.length,
    visibleCount: Math.min(getVisibleSuggestionLimit(), rankedSuggestions.length),
    simulatedCount: bySource.simulated,
    futureAgentCount: bySource.future_agent,
    byNextAction,
    bySource,
    estimatedScoreCount,
    averageEstimatedScore:
      estimatedScoreCount > 0 ? Math.round(estimatedScoreTotal / estimatedScoreCount) : null,
    rankedSuggestions: rankedSuggestions.slice(0, getVisibleSuggestionLimit()),
  };
}
