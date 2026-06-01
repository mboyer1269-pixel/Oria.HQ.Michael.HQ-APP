import { getDefaultActiveValidationSlotLimit, isActiveVentureStatus } from "./lifecycle";
import type { VentureCard, VentureLifecycleStatus, VentureScore } from "./types";

const TERMINAL_STATUSES: ReadonlySet<VentureLifecycleStatus> = new Set(["archived", "killed"]);

const STATUS_ORDER: readonly VentureLifecycleStatus[] = [
  "discovered",
  "candidate",
  "scored",
  "shortlisted",
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
  "paused",
  "killed",
  "archived",
];

export type VentureCockpitSourceKind = "saved" | "demo";

export type VentureCockpitCard = {
  kind: VentureCockpitSourceKind;
  card: VentureCard;
};

export type VentureDecisionQueueItem = {
  id: string;
  ventureId: string;
  name: string;
  status: VentureLifecycleStatus;
  recommendation?: VentureScore["recommendation"];
  suggestedAction: string;
  reason: string;
  score?: number;
  priority: number;
};

export type VentureCockpit = {
  totalVentures: number;
  demoCount: number;
  savedCount: number;
  scoredCount: number;
  unscoredCandidateCount: number;
  activeValidationCount: number;
  activeValidationSlotLimit: number;
  activeValidationSlotsRemaining: number;
  terminalCount: number;
  countsByStatus: Record<VentureLifecycleStatus, number>;
  countsByRecommendation: Record<VentureScore["recommendation"], number>;
  topScoredVentures: VentureCard[];
  decisionQueue: VentureDecisionQueueItem[];
  nextRecommendedDecision: VentureDecisionQueueItem | null;
};

type CockpitDecisionCandidate = {
  card: VentureCard;
  priority: number;
  suggestedAction: string;
  reason: string;
  score?: number;
};

function createEmptyStatusCounts(): Record<VentureLifecycleStatus, number> {
  return STATUS_ORDER.reduce(
    (counts, status) => {
      counts[status] = 0;
      return counts;
    },
    {} as Record<VentureLifecycleStatus, number>,
  );
}

function createEmptyRecommendationCounts(): Record<VentureScore["recommendation"], number> {
  return {
    go: 0,
    test_small: 0,
    hold: 0,
    kill: 0,
  };
}

function isSavedCandidateWithoutScore(card: VentureCard): boolean {
  return card.status === "candidate" && !card.score;
}

function buildDecisionCandidate(card: VentureCard): CockpitDecisionCandidate | null {
  if (isSavedCandidateWithoutScore(card)) {
    return {
      card,
      priority: 0,
      suggestedAction: "Score this candidate",
      reason: "Unscored saved candidate. Add the 11 sub-scores before any promotion.",
    };
  }

  if (card.status === "scored" && card.score) {
    if (card.score.recommendation === "go" || card.score.recommendation === "test_small") {
      return {
        card,
        priority: 1,
        suggestedAction: "Consider promoting",
        reason: `Recommendation ${card.score.recommendation} with ${card.score.overallScore}/100. Review whether the CEO wants the next step.`,
        score: card.score.overallScore,
      };
    }

    if (card.score.recommendation === "hold") {
      return {
        card,
        priority: 2,
        suggestedAction: "Review later",
        reason: `Hold band at ${card.score.overallScore}/100. Keep it visible, but it is not the next move.`,
        score: card.score.overallScore,
      };
    }

    return {
      card,
      priority: 3,
      suggestedAction: "Consider kill decision",
      reason: `Kill band at ${card.score.overallScore}/100. Compare against better opportunities before spending more attention.`,
      score: card.score.overallScore,
    };
  }

  if (isActiveVentureStatus(card.status)) {
    return {
      card,
      priority: 4,
      suggestedAction: "Monitor",
      reason: "Already in an active validation or operating stage. Observe evidence instead of re-deciding now.",
    };
  }

  if (TERMINAL_STATUSES.has(card.status)) {
    return {
      card,
      priority: 5,
      suggestedAction: "No active decision",
      reason: "Terminal venture. History is preserved and no active decision is required.",
    };
  }

  return null;
}

export function buildVentureCockpit(input: {
  savedCards: VentureCard[];
  demoCards: VentureCard[];
  activeValidationSlotLimit?: number;
}): VentureCockpit {
  const activeValidationSlotLimit =
    input.activeValidationSlotLimit ?? getDefaultActiveValidationSlotLimit();
  const countsByStatus = createEmptyStatusCounts();
  const countsByRecommendation = createEmptyRecommendationCounts();
  const scoredCards: VentureCard[] = [];
  const queueCandidates: CockpitDecisionCandidate[] = [];

  for (const card of input.savedCards) {
    countsByStatus[card.status] += 1;

    if (card.score) {
      countsByRecommendation[card.score.recommendation] += 1;
      scoredCards.push(card);
    }

    const candidate = buildDecisionCandidate(card);
    if (candidate) {
      queueCandidates.push(candidate);
    }
  }

  const savedCount = input.savedCards.length;
  const demoCount = input.demoCards.length;
  const scoredCount = scoredCards.length;
  const unscoredCandidateCount = input.savedCards.filter(isSavedCandidateWithoutScore).length;
  const activeValidationCount = input.savedCards.filter((card) => isActiveVentureStatus(card.status)).length;
  const terminalCount = input.savedCards.filter((card) => TERMINAL_STATUSES.has(card.status)).length;

  const topScoredVentures = [...scoredCards]
    .sort((left, right) => {
      const scoreDelta = (right.score?.overallScore ?? 0) - (left.score?.overallScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 5);

  const decisionQueue = queueCandidates
    .sort((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
      if (scoreDelta !== 0) return scoreDelta;
      return left.card.name.localeCompare(right.card.name);
    })
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.card.id,
      ventureId: candidate.card.id,
      name: candidate.card.name,
      status: candidate.card.status,
      recommendation: candidate.card.score?.recommendation,
      suggestedAction: candidate.suggestedAction,
      reason: candidate.reason,
      score: candidate.score,
      priority: candidate.priority,
    }));

  return {
    totalVentures: savedCount + demoCount,
    demoCount,
    savedCount,
    scoredCount,
    unscoredCandidateCount,
    activeValidationCount,
    activeValidationSlotLimit,
    activeValidationSlotsRemaining: Math.max(0, activeValidationSlotLimit - activeValidationCount),
    terminalCount,
    countsByStatus,
    countsByRecommendation,
    topScoredVentures,
    decisionQueue,
    nextRecommendedDecision: decisionQueue[0] ?? null,
  };
}
