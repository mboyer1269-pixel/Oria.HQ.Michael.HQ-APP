import type { ArenaCandidate, ArenaVerdict } from "@/server/arena/roi-arena";
import { rankCandidates } from "@/server/arena/roi-arena";
import {
  applyArenaWraEvidence,
  classifyArenaWraEvidenceQuality,
  type ArenaWraEvidence,
  type ArenaWraEvidenceMap,
  type ArenaWraEvidenceQuality,
} from "@/server/arena/arena-wra-evidence";

export type ArenaWraBucket = "FOCUS" | "GO" | "DEFER" | "KILL";

export type ArenaWraSignal = {
  candidateId: string;
  rankIndex: number | null;
  arenaVerdict: ArenaVerdict;
  bucket: ArenaWraBucket | null;
  evidenceQuality: ArenaWraEvidenceQuality;
  reason: string;
};

export type ArenaWraBucketInput = {
  candidates: ArenaCandidate[];
  evidenceByCandidateId?: ArenaWraEvidenceMap;
};

export type ArenaWraBucketResult = {
  signals: ArenaWraSignal[];
  generatedAt: string;
};

function getEvidence(
  candidateId: string,
  evidenceByCandidateId?: ArenaWraEvidenceMap,
): ArenaWraEvidence | undefined {
  return evidenceByCandidateId?.[candidateId];
}

function hasStrongWraEvidence(evidence: ArenaWraEvidence | undefined): boolean {
  return classifyArenaWraEvidenceQuality(evidence) === "strong";
}

function isRiskOrAutonomyCapped(candidate: ArenaCandidate): boolean {
  return candidate.riskLevel === "high" || (candidate.autonomyLevel ?? 1) >= 5;
}

export function classifyArenaWraBucket(
  candidate: ArenaCandidate,
  arenaVerdict: ArenaVerdict,
  rankIndex: number | null,
  evidence?: ArenaWraEvidence,
): ArenaWraSignal {
  const evidenceQuality = classifyArenaWraEvidenceQuality(evidence);

  if (evidenceQuality === "none") {
    return {
      candidateId: candidate.id,
      rankIndex,
      arenaVerdict,
      bucket: null,
      evidenceQuality,
      reason: "No evidence signal supplied.",
    };
  }

  if (evidenceQuality === "weak") {
    return {
      candidateId: candidate.id,
      rankIndex,
      arenaVerdict,
      bucket: "DEFER",
      evidenceQuality,
      reason: "Evidence is too weak to promote the candidate.",
    };
  }

  if (
    candidate.assumedRevenueInfluencedCents === undefined ||
    candidate.estimatedCostCents === undefined ||
    candidate.assumedRevenueInfluencedCents === null ||
    candidate.estimatedCostCents === null
  ) {
    return {
      candidateId: candidate.id,
      rankIndex,
      arenaVerdict,
      bucket: "DEFER",
      evidenceQuality,
      reason: "Evidence is strong but ROI inputs are still incomplete.",
    };
  }

  if (candidate.assumedRevenueInfluencedCents < candidate.estimatedCostCents) {
    return {
      candidateId: candidate.id,
      rankIndex,
      arenaVerdict,
      bucket: "KILL",
      evidenceQuality,
      reason: "Negative ROI.",
    };
  }

  if (rankIndex === 0 && !isRiskOrAutonomyCapped(candidate) && hasStrongWraEvidence(evidence)) {
    return {
      candidateId: candidate.id,
      rankIndex,
      arenaVerdict,
      bucket: "FOCUS",
      evidenceQuality,
      reason: "Strong evidence, positive ROI, and top-ranked candidate.",
    };
  }

  return {
    candidateId: candidate.id,
    rankIndex,
    arenaVerdict,
    bucket: "GO",
    evidenceQuality,
    reason: "Strong evidence with positive ROI, but not top-ranked or capped.",
  };
}

export function buildArenaWraBuckets(input: ArenaWraBucketInput): ArenaWraBucketResult {
  const enrichedCandidates = input.candidates.map((candidate) =>
    applyArenaWraEvidence(candidate, getEvidence(candidate.id, input.evidenceByCandidateId)),
  );

  const rankedVerdicts = rankCandidates(enrichedCandidates);
  const candidateById = new Map(enrichedCandidates.map((candidate) => [candidate.id, candidate]));

  const signals = rankedVerdicts.map((arenaVerdict, rankIndex) => {
    const candidate = candidateById.get(arenaVerdict.candidateId);

    if (!candidate) {
      return {
        candidateId: arenaVerdict.candidateId,
        rankIndex,
        arenaVerdict,
        bucket: null,
        evidenceQuality: "none" as const,
        reason: "Candidate missing from signal input.",
      };
    }

    return classifyArenaWraBucket(
      candidate,
      arenaVerdict,
      rankIndex,
      getEvidence(candidate.id, input.evidenceByCandidateId),
    );
  });

  return {
    signals,
    generatedAt: new Date().toISOString(),
  };
}
