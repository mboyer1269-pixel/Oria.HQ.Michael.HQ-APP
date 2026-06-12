// Compound Learning Loop — pure logic.
//
// Closes the loop between the ROI Arena and the Memory Vault: arena verdicts
// (which otherwise die in a TTL'd in-memory store) are distilled into
// per-agent ROI summaries and *proposed* memory lessons. Proposals are never
// auto-verified — the Memory Vault contract holds: agent-authored entries
// require CEO approval before they become "verified" and reach Joris context.
//
// Pure module: no fs, no server-only, no Date.now() — callers supply
// timestamps. Tested in agent-learning-loop.test.mjs.

import type { MemoryEntry } from "./memory-graph";
import { normalizeMemoryId } from "./memory-graph";

export type LearningSignalKind = "mission" | "idea" | "agent-action";
export type LearningDecision = "promising" | "marginal" | "reject" | "not-evaluable";

/** One arena verdict flattened into a learnable signal. */
export type LearningSignal = {
  candidateId: string;
  kind: LearningSignalKind;
  /** Attribution when the candidate carried it; absent verdicts group under "non-attribué". */
  agentId?: string;
  skillId?: string;
  title?: string;
  decision: LearningDecision;
  score: number;
  netValueCents: number | null;
  roiMultiple: number | null;
  reasons: string[];
  guardReason?: string;
  storedAt: string;
};

export type AgentRoiSummary = {
  /** agentId, else skillId, else "non-attribué". */
  agentKey: string;
  signals: number;
  promising: number;
  marginal: number;
  rejected: number;
  notEvaluable: number;
  averageScore: number | null;
  /** Sum of known net values; signals with null netValue contribute 0. */
  totalNetValueCents: number;
  bestRoiMultiple: number | null;
  /** promising / (promising + marginal + rejected); null when nothing evaluable. */
  winRate: number | null;
};

export type LessonProposalKind = "winning-pattern" | "failure-pattern" | "guard-pattern";

export type LessonProposal = {
  /** Normalized id, stable for a given pattern — used for dedupe. */
  id: string;
  kind: LessonProposalKind;
  title: string;
  content: string;
  tags: string[];
  /** Candidate ids backing this lesson. */
  sourceRefs: string[];
  confidence: "low" | "medium" | "high";
  agentKey: string;
};

export type LearningLoopReport = {
  summaries: AgentRoiSummary[];
  proposals: LessonProposal[];
  /** Proposals dropped because the vault already holds an entry with that id/title. */
  duplicatesSkipped: number;
  signalCount: number;
};

/** A pattern needs at least this many occurrences before it becomes a lesson. */
export const MIN_PATTERN_OCCURRENCES = 2;
/** ROI multiple at or above which a promising verdict counts as a winning pattern. */
export const WINNING_ROI_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

type StoredVerdictLike = {
  storedAt: string;
  verdict: {
    candidateId: string;
    kind: LearningSignalKind;
    decision: LearningDecision;
    score: number;
    netValueCents: number | null;
    roiMultiple: number | null;
    reasons: string[];
    guardReason?: string;
  };
};

type CandidateLike = {
  agentId?: string;
  skillId?: string;
  title?: string;
};

/** Flattens a stored arena verdict (+ optional candidate metadata) into a signal. */
export function adaptStoredVerdict(
  stored: StoredVerdictLike,
  candidate?: CandidateLike,
): LearningSignal {
  return {
    candidateId: stored.verdict.candidateId,
    kind: stored.verdict.kind,
    agentId: candidate?.agentId,
    skillId: candidate?.skillId,
    title: candidate?.title,
    decision: stored.verdict.decision,
    score: stored.verdict.score,
    netValueCents: stored.verdict.netValueCents,
    roiMultiple: stored.verdict.roiMultiple,
    reasons: stored.verdict.reasons,
    guardReason: stored.verdict.guardReason,
    storedAt: stored.storedAt,
  };
}

// ---------------------------------------------------------------------------
// ROI summaries
// ---------------------------------------------------------------------------

export const UNATTRIBUTED_AGENT_KEY = "non-attribué";

function agentKeyOf(signal: LearningSignal): string {
  return signal.agentId ?? signal.skillId ?? UNATTRIBUTED_AGENT_KEY;
}

/** Groups signals per agent and computes ROI/efficiency aggregates. */
export function buildAgentRoiSummaries(signals: LearningSignal[]): AgentRoiSummary[] {
  const groups = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    const key = agentKeyOf(signal);
    const group = groups.get(key) ?? [];
    group.push(signal);
    groups.set(key, group);
  }

  const summaries: AgentRoiSummary[] = [];
  for (const [agentKey, group] of groups) {
    const promising = group.filter((s) => s.decision === "promising").length;
    const marginal = group.filter((s) => s.decision === "marginal").length;
    const rejected = group.filter((s) => s.decision === "reject").length;
    const notEvaluable = group.filter((s) => s.decision === "not-evaluable").length;
    const evaluable = promising + marginal + rejected;

    const totalNetValueCents = group.reduce(
      (sum, s) => sum + (s.netValueCents ?? 0),
      0,
    );
    const roiMultiples = group
      .map((s) => s.roiMultiple)
      .filter((value): value is number => value !== null);

    summaries.push({
      agentKey,
      signals: group.length,
      promising,
      marginal,
      rejected,
      notEvaluable,
      averageScore:
        group.length > 0
          ? group.reduce((sum, s) => sum + s.score, 0) / group.length
          : null,
      totalNetValueCents,
      bestRoiMultiple: roiMultiples.length > 0 ? Math.max(...roiMultiples) : null,
      winRate: evaluable > 0 ? promising / evaluable : null,
    });
  }

  // Highest total net value first — the ROI leaderboard ordering.
  return summaries.sort((a, b) => b.totalNetValueCents - a.totalNetValueCents);
}

// ---------------------------------------------------------------------------
// Lesson derivation
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `${(cents / 100).toFixed(2)}$`;
}

/**
 * Derives lesson proposals from repeated patterns in the signals.
 *
 * - failure-pattern: the same rejection reason seen MIN_PATTERN_OCCURRENCES+ times.
 * - guard-pattern: the same execution-guard reason seen MIN_PATTERN_OCCURRENCES+ times.
 * - winning-pattern: an agent with MIN_PATTERN_OCCURRENCES+ promising verdicts
 *   at ROI >= WINNING_ROI_THRESHOLD.
 *
 * Proposals whose id (or normalized title) already exists in the vault are
 * skipped — one lesson per file, no duplicates.
 */
export function deriveLessonProposals(
  signals: LearningSignal[],
  existingEntries: MemoryEntry[],
): { proposals: LessonProposal[]; duplicatesSkipped: number } {
  const candidates: LessonProposal[] = [];

  // failure-pattern — group rejects by their primary reason.
  const rejectsByReason = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    if (signal.decision !== "reject" || signal.reasons.length === 0) continue;
    const reasonKey = normalizeMemoryId(signal.reasons[0]);
    if (!reasonKey) continue;
    const group = rejectsByReason.get(reasonKey) ?? [];
    group.push(signal);
    rejectsByReason.set(reasonKey, group);
  }
  for (const [reasonKey, group] of rejectsByReason) {
    if (group.length < MIN_PATTERN_OCCURRENCES) continue;
    candidates.push({
      id: `lesson-failure-${reasonKey}`,
      kind: "failure-pattern",
      title: `Pattern d'échec: ${group[0].reasons[0]}`,
      content:
        `${group.length} candidats rejetés par l'Arena pour la même raison: ` +
        `"${group[0].reasons[0]}". Corriger la cause en amont avant de proposer ` +
        `de nouveaux candidats de ce type.`,
      tags: ["learning-loop", "failure-pattern", "arena"],
      sourceRefs: group.map((s) => s.candidateId),
      confidence: group.length >= MIN_PATTERN_OCCURRENCES * 2 ? "high" : "medium",
      agentKey: agentKeyOf(group[0]),
    });
  }

  // guard-pattern — repeated execution-guard blocks.
  const blocksByGuard = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    if (!signal.guardReason) continue;
    const guardKey = normalizeMemoryId(signal.guardReason);
    if (!guardKey) continue;
    const group = blocksByGuard.get(guardKey) ?? [];
    group.push(signal);
    blocksByGuard.set(guardKey, group);
  }
  for (const [guardKey, group] of blocksByGuard) {
    if (group.length < MIN_PATTERN_OCCURRENCES) continue;
    candidates.push({
      id: `lesson-guard-${guardKey}`,
      kind: "guard-pattern",
      title: `Garde-fou récurrent: ${group[0].guardReason}`,
      content:
        `${group.length} candidats bloqués par le même garde-fou: ` +
        `"${group[0].guardReason}". Soit les candidats visent une zone interdite ` +
        `(corriger la génération), soit la policy mérite une revue CEO.`,
      tags: ["learning-loop", "guard-pattern", "execution-guard"],
      sourceRefs: group.map((s) => s.candidateId),
      confidence: "medium",
      agentKey: agentKeyOf(group[0]),
    });
  }

  // winning-pattern — per agent, repeated promising verdicts at strong ROI.
  const winsByAgent = new Map<string, LearningSignal[]>();
  for (const signal of signals) {
    if (signal.decision !== "promising") continue;
    if (signal.roiMultiple === null || signal.roiMultiple < WINNING_ROI_THRESHOLD) continue;
    const key = agentKeyOf(signal);
    const group = winsByAgent.get(key) ?? [];
    group.push(signal);
    winsByAgent.set(key, group);
  }
  for (const [agentKey, group] of winsByAgent) {
    if (group.length < MIN_PATTERN_OCCURRENCES) continue;
    const totalNet = group.reduce((sum, s) => sum + (s.netValueCents ?? 0), 0);
    candidates.push({
      id: `lesson-winning-${normalizeMemoryId(agentKey)}`,
      kind: "winning-pattern",
      title: `Pattern gagnant: ${agentKey} (ROI ≥ ${WINNING_ROI_THRESHOLD}x)`,
      content:
        `${group.length} verdicts "promising" à ROI ≥ ${WINNING_ROI_THRESHOLD}x pour ` +
        `${agentKey}, valeur nette cumulée ${formatCents(totalNet)}. Reproduire ce ` +
        `type de candidat en priorité.`,
      tags: ["learning-loop", "winning-pattern", "roi"],
      sourceRefs: group.map((s) => s.candidateId),
      confidence: "medium",
      agentKey,
    });
  }

  // Dedupe against the vault: same id, or same normalized title on a note.
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  const existingTitleKeys = new Set(
    existingEntries.map((entry) => `${entry.type}:${normalizeMemoryId(entry.title)}`),
  );

  const proposals: LessonProposal[] = [];
  let duplicatesSkipped = 0;
  for (const proposal of candidates) {
    const titleKey = `note:${normalizeMemoryId(proposal.title)}`;
    if (existingIds.has(proposal.id) || existingTitleKeys.has(titleKey)) {
      duplicatesSkipped += 1;
      continue;
    }
    proposals.push(proposal);
  }

  return { proposals, duplicatesSkipped };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export function buildLearningLoopReport(
  signals: LearningSignal[],
  existingEntries: MemoryEntry[],
): LearningLoopReport {
  const { proposals, duplicatesSkipped } = deriveLessonProposals(signals, existingEntries);
  return {
    summaries: buildAgentRoiSummaries(signals),
    proposals,
    duplicatesSkipped,
    signalCount: signals.length,
  };
}

// ---------------------------------------------------------------------------
// Serialization — proposal -> vault markdown (approval-ready, never auto-written)
// ---------------------------------------------------------------------------

/**
 * Serializes a lesson proposal into a Memory Vault markdown file
 * (`memory/notes/<id>.md` once CEO-approved). `status: proposed` keeps the
 * governance explicit; approval flips it to `active`.
 *
 * Round-trips through parseMemoryEntryMarkdown — verified in tests.
 */
export function serializeLessonProposalMarkdown(
  proposal: LessonProposal,
  dateIso: string,
): string {
  const agentLink =
    proposal.agentKey !== UNATTRIBUTED_AGENT_KEY
      ? `\n\nAgent concerné: [[agent:${normalizeMemoryId(proposal.agentKey)}]]`
      : "";
  return [
    "---",
    `id: ${proposal.id}`,
    "type: note",
    `title: ${proposal.title}`,
    "status: proposed",
    `tags: ${proposal.tags.join(", ")}`,
    `confidence: ${proposal.confidence}`,
    `sourceRefs: ${proposal.sourceRefs.join(", ")}`,
    `createdAt: ${dateIso}`,
    `updatedAt: ${dateIso}`,
    "---",
    "",
    `# ${proposal.title}`,
    "",
    `${proposal.content}${agentLink}`,
    "",
  ].join("\n");
}
