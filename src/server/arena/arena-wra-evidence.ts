import type { ArenaCandidate } from "@/server/arena/roi-arena";

export const ARENA_WRA_EVIDENCE_REVENUE_THRESHOLD_CENTS = 25_000;

export type ArenaWraEvidence = {
  candidateId: string;
  assumedRevenueInfluencedCents: number;
  estimatedCostCents?: number;
  note?: string;
  source?: string;
};

export type ArenaWraEvidenceMap = Record<string, ArenaWraEvidence | undefined>;

export type ArenaWraEvidenceQuality = "none" | "weak" | "strong";

export function applyArenaWraEvidence(
  candidate: ArenaCandidate,
  evidence?: ArenaWraEvidence,
): ArenaCandidate {
  if (!evidence || evidence.candidateId !== candidate.id) {
    return { ...candidate };
  }

  return {
    ...candidate,
    assumedRevenueInfluencedCents: evidence.assumedRevenueInfluencedCents,
    ...(evidence.estimatedCostCents !== undefined
      ? { estimatedCostCents: evidence.estimatedCostCents }
      : {}),
  };
}

export function classifyArenaWraEvidenceQuality(
  evidence?: ArenaWraEvidence,
): ArenaWraEvidenceQuality {
  if (!evidence) {
    return "none";
  }

  const note = evidence.note?.trim() ?? "";
  const source = evidence.source?.trim() ?? "";

  if (
    note.length === 0 ||
    source.length === 0 ||
    evidence.assumedRevenueInfluencedCents < ARENA_WRA_EVIDENCE_REVENUE_THRESHOLD_CENTS
  ) {
    return "weak";
  }

  return "strong";
}

export function hasArenaWraEvidence(candidateId: string, evidenceMap?: ArenaWraEvidenceMap): boolean {
  return Boolean(evidenceMap?.[candidateId]);
}
