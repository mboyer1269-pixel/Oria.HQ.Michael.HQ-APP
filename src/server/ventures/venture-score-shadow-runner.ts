// src/server/ventures/venture-score-shadow-runner.ts
//
// V7 Phase 1 step 3 — shadow mode.
//
// An agent proposes the 11 venture sub-scores with a cited source per
// dimension. The owner scores normally. Both land in the action ledger, and the
// divergence between them is the measurement that later decides whether the
// agent has earned any autonomy at all.
//
// THE SHADOW LOG IS A MIRROR, NEVER AN ACTOR:
//   * Nothing here calls scoreVenture, promoteVenture, archiveVenture or
//     killVenture. A proposal cannot move a venture through its lifecycle.
//   * Nothing here executes anything or reaches outside the process, beyond the
//     LLM call that produces the proposal.
//   * Every write is an append to the existing action_ledger. There is no
//     parallel audit store — a second history would immediately disagree with
//     the first one.
//
// Storage decision: the live action_ledger already carries workspace scoping,
// append-only semantics, RLS blocking anon/authenticated, and two jsonb columns.
// A shadow proposal is a `decision` event that authorizes nothing, which is
// exactly what that table models. Writing here needs no migration, so this step
// adds no production schema change.
//
// Provider: the HTTP client (generateStructuredJson, Anthropic → OpenAI). The
// local CLI provider is frozen pending redesign and was always an additive cost
// optimisation, never a dependency of this step.
//
// ---------------------------------------------------------------------------
// OPEN GAP — recordShadowOutcome has no caller yet
// ---------------------------------------------------------------------------
//
// `recordShadowOutcome` is implemented and tested, and NOTHING IN THE REAL FLOW
// CALLS IT. Neither does anything call `runShadowScorePass`. Both halves of
// shadow mode are inert today.
//
// That is survivable only because they are inert *together*: nothing produces
// proposals either, so no measurement is being lost right now. The moment the
// step-4 trigger starts generating proposals without this hook in place,
// proposals accumulate against owner decisions that were never recorded — and
// the pairing cannot be reconstructed after the fact. Divergence is the entire
// asset of shadow mode; unpaired proposals are worth nothing.
//
// Wiring it is NOT a small addition, which is why it is not done here:
//
//   1. The ledger read model (`listActionLedgerForWorkspace`) is a generic list.
//      Retrieving the most recent proposal for one venture needs a dedicated
//      read helper, not a caller-side filter over the whole workspace history.
//   2. Rebuilding a VentureScoreProposal from ledger metadata is a LOSSY
//      conversion — rationales are truncated to 240 chars on the way in — so it
//      needs its own contract and tests rather than an inline cast.
//   3. The hook belongs on `scoreVentureAction`, which is the owner's live
//      scoring path. Adding it changes this module from "cannot do anything" to
//      "runs on every score the owner records", and deserves review as the risk
//      change it is.
//
// Tracked by `shadow-mode-wiring-gap.test.mjs`, which fails on purpose until a
// real caller exists. Do not delete that test without wiring this.

import "server-only";

import { randomUUID } from "node:crypto";
import type { VentureCard } from "@/core/types";
import type { WorkspaceContext } from "@/core/workspace-context";
import {
  MAX_SUB_SCORE,
  MIN_SUB_SCORE,
  SCORE_DIMENSIONS,
} from "@/features/ventures/venture-scoring";
import type { VentureSubScores } from "@/features/ventures/venture-scoring";
import {
  buildVentureScoreProposal,
  measureProposalDivergence,
} from "@/features/ventures/venture-score-proposal";
import type {
  EvidenceSource,
  ScoreEvidence,
  VentureScoreProposal,
} from "@/features/ventures/venture-score-proposal";
import type { VentureScore } from "@/core/types";
import { generateStructuredJson } from "@/server/ai/llm-json-provider";
import { recordLedgerEvent } from "@/server/actions/ledger-events";
import type { LedgerEventPayload } from "@/server/actions/ledger-events";
import { listVenturesForWorkspace } from "./venture-repository";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SHADOW_PROPOSAL_ACTION_TYPE = "venture.score.shadow_proposal";
export const SHADOW_OUTCOME_ACTION_TYPE = "venture.score.shadow_outcome";

/** A1 on the autonomy scale: prepare and propose, execute nothing. */
const SHADOW_AUTONOMY_LEVEL = 1;

/** Rationales are model-authored and unbounded; the ledger row is not. */
const MAX_LEDGER_RATIONALE_CHARS = 240;
const MAX_LEDGER_SOURCE_CHARS = 200;

// ---------------------------------------------------------------------------
// Prompt construction (pure)
// ---------------------------------------------------------------------------

export function buildShadowSystemPrompt(): string {
  const dimensionList = SCORE_DIMENSIONS.map(
    (dimension) =>
      `- ${dimension.key} (${dimension.label}) — ${
        dimension.polarity === "negative"
          ? "higher is WORSE"
          : "higher is BETTER"
      }`,
  ).join("\n");

  return [
    "You score early-stage business ideas for an operator. Return JSON only — no prose, no fences.",
    "",
    `Score all ${SCORE_DIMENSIONS.length} dimensions from ${MIN_SUB_SCORE} to ${MAX_SUB_SCORE}:`,
    dimensionList,
    "",
    "Shape:",
    '{"evidence":[{"dimension":"<key>","value":<0-10>,"rationale":"<one sentence>",',
    '"source":{"kind":"external","url":"https://..."}}]}',
    "",
    "source.kind is one of:",
    '  "external" with a real url you are confident exists,',
    '  "internal" with a ref naming the venture field you reasoned from,',
    '  "none" when you have no evidence.',
    "",
    'Use "none" honestly. A fabricated url is worse than an admitted gap: the',
    "operator checks sources, and an invented one destroys the value of every",
    "other score in the set.",
  ].join("\n");
}

export function buildShadowUserPrompt(venture: VentureCard): string {
  const field = (label: string, value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? `${label}: ${value.trim()}` : null;

  return [
    field("Name", venture.name),
    field("Description", venture.description),
    field("Target customer", venture.targetCustomer),
    field("Problem", venture.problem),
    field("Offer", venture.offer),
    field("Primary channel", venture.primaryChannel),
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing — degrades per dimension, never as a whole
// ---------------------------------------------------------------------------

/**
 * The value an unmeasured dimension takes.
 *
 * Deliberately the WORST case for the dimension's polarity, so a missing
 * measurement pulls the score down rather than up. A midpoint would assert a
 * finding nobody made, and on an inverted dimension a low value would read as
 * "low risk" — flattering a venture precisely where evidence is absent.
 */
export function unresolvedValueFor(dimension: (typeof SCORE_DIMENSIONS)[number]): number {
  return dimension.polarity === "negative" ? MAX_SUB_SCORE : MIN_SUB_SCORE;
}

function readSource(raw: unknown): EvidenceSource | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (record.kind === "none") return { kind: "none" };
  if (record.kind === "internal" && typeof record.ref === "string" && record.ref.trim()) {
    return { kind: "internal", ref: record.ref.trim() };
  }
  if (record.kind === "external" && typeof record.url === "string") {
    const url = record.url.trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { kind: "external", url };
      }
    } catch {
      // Not a usable url — treated as no evidence below.
    }
  }
  return null;
}

export type ParsedEvidence = {
  evidence: ScoreEvidence[];
  /** Dimensions the model did not usably answer, filled with a worst case. */
  unresolved: (keyof VentureSubScores)[];
};

/**
 * Turns a model reply into a complete evidence set.
 *
 * One dimension failing never fails the pass: the missing entry is filled with
 * an explicit unresolved marker and recorded, so an incomplete answer still
 * produces a proposal the owner can compare against — and one whose evidence
 * gates correctly refuse to pass.
 */
export function parseShadowEvidence(json: unknown): ParsedEvidence {
  const rows: unknown[] =
    typeof json === "object" && json !== null && Array.isArray((json as { evidence?: unknown }).evidence)
      ? ((json as { evidence: unknown[] }).evidence)
      : [];

  const byDimension = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    if (typeof record.dimension === "string" && !byDimension.has(record.dimension)) {
      byDimension.set(record.dimension, record);
    }
  }

  const evidence: ScoreEvidence[] = [];
  const unresolved: (keyof VentureSubScores)[] = [];

  for (const dimension of SCORE_DIMENSIONS) {
    const row = byDimension.get(dimension.key);
    const rawValue = row?.value;
    const source = row ? readSource(row.source) : null;
    const rationale = typeof row?.rationale === "string" ? row.rationale.trim() : "";

    const usableValue =
      typeof rawValue === "number" &&
      Number.isFinite(rawValue) &&
      rawValue >= MIN_SUB_SCORE &&
      rawValue <= MAX_SUB_SCORE;

    if (!usableValue || !source || rationale.length === 0) {
      unresolved.push(dimension.key);
      evidence.push({
        dimension: dimension.key,
        value: unresolvedValueFor(dimension),
        rationale: "Evidence collection did not return a usable answer for this dimension.",
        source: { kind: "none" },
      });
      continue;
    }

    evidence.push({
      dimension: dimension.key,
      value: Math.round(rawValue),
      rationale,
      source,
    });
  }

  return { evidence, unresolved };
}

// ---------------------------------------------------------------------------
// Ledger shaping
// ---------------------------------------------------------------------------

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function describeSource(source: EvidenceSource): string {
  if (source.kind === "external") return truncate(source.url, MAX_LEDGER_SOURCE_CHARS);
  if (source.kind === "internal") return truncate(source.ref, MAX_LEDGER_SOURCE_CHARS);
  return "none";
}

/**
 * Shapes a proposal for the ledger.
 *
 * Model-authored text is truncated: the ledger is an audit trail, and an
 * unbounded reply would let one row grow without limit. Key names avoid the
 * ledger's sensitive-key denylist (`payload`, `message`, `prompt`, `token`, …),
 * which rejects an event outright rather than trimming it.
 */
export function buildProposalLedgerMetadata(
  proposal: VentureScoreProposal,
  unresolved: readonly (keyof VentureSubScores)[],
): Record<string, unknown> {
  return {
    // Written at a FIXED path. The prepared index keys on
    // metadata->>'ventureId', so moving either key silently degrades the lookup
    // to a scan without anything failing — pinned by a test for that reason.
    proposalId: proposal.proposalId,
    ventureId: proposal.ventureId,
    proposedBy: proposal.proposedBy,
    overallScore: proposal.score.overallScore,
    recommendation: proposal.score.recommendation,
    gatesPassed: proposal.gates.allPassed,
    failedGates: proposal.gates.gates.filter((gate) => !gate.passed).map((gate) => gate.id),
    unresolvedDimensions: [...unresolved],
    distinctExternalSources: new Set(
      proposal.evidence
        .filter((item) => item.source.kind === "external")
        .map((item) => describeSource(item.source)),
    ).size,
    dimensions: proposal.evidence.map((item) => ({
      dimension: item.dimension,
      value: item.value,
      sourceKind: item.source.kind,
      source: describeSource(item.source),
      rationale: truncate(item.rationale, MAX_LEDGER_RATIONALE_CHARS),
    })),
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export type ShadowRunnerDeps = {
  listVentures?: (workspaceId: string) => Promise<VentureCard[]>;
  generateJson?: typeof generateStructuredJson;
  recordEvent?: (ctx: WorkspaceContext, event: LedgerEventPayload) => Promise<unknown>;
  now?: () => string;
  agentId?: string;
  /** Injectable so proposal identity is deterministic under test. */
  newProposalId?: () => string;
};

export type ShadowProposalOutcome =
  | { status: "proposed"; proposal: VentureScoreProposal; unresolved: (keyof VentureSubScores)[] }
  | { status: "skipped"; ventureId: string; reason: string };

const DEFAULT_AGENT_ID = "venture_scorer";

/**
 * Produces and logs one shadow proposal.
 *
 * Returns a skip rather than throwing on any failure: a pass over many ventures
 * must not stop because one model call or one ledger write failed. The reason is
 * carried back so the caller can report it.
 */
export async function runShadowProposalForVenture(
  ctx: WorkspaceContext,
  venture: VentureCard,
  deps: ShadowRunnerDeps = {},
): Promise<ShadowProposalOutcome> {
  const generate = deps.generateJson ?? generateStructuredJson;
  const record = deps.recordEvent ?? recordLedgerEvent;
  const agentId = deps.agentId ?? DEFAULT_AGENT_ID;
  const proposedAt = (deps.now ?? (() => new Date().toISOString()))();

  let generated: Awaited<ReturnType<typeof generateStructuredJson>>;
  try {
    generated = await generate({
      providerPreference: "auto",
      systemPrompt: buildShadowSystemPrompt(),
      userPrompt: buildShadowUserPrompt(venture),
    });
  } catch {
    return { status: "skipped", ventureId: venture.id, reason: "evidence collection threw" };
  }

  if (!generated.ok) {
    return {
      status: "skipped",
      ventureId: venture.id,
      reason: `evidence collection failed: ${generated.fallbackReason}`,
    };
  }

  const { evidence, unresolved } = parseShadowEvidence(generated.json);

  const built = buildVentureScoreProposal({
    // Minted here, before anything is persisted: the domain owns its identity,
    // and it must exist even if every downstream write fails.
    proposalId: (deps.newProposalId ?? randomUUID)(),
    ventureId: venture.id,
    workspaceId: ctx.workspace.id,
    proposedBy: agentId,
    proposedAt,
    evidence,
  });

  if (built.status === "rejected") {
    return {
      status: "skipped",
      ventureId: venture.id,
      reason: `proposal rejected: ${built.code}`,
    };
  }

  const proposal = built.proposal;

  try {
    await record(ctx, {
      eventType: "decision",
      actionType: SHADOW_PROPOSAL_ACTION_TYPE,
      summary:
        `Proposition d'agent pour ${venture.name || venture.id} : ` +
        `${proposal.score.recommendation} (${proposal.score.overallScore}/100), ` +
        `portes ${proposal.gates.allPassed ? "franchies" : "non franchies"}.`,
      autonomyLevel: SHADOW_AUTONOMY_LEVEL,
      requiresConfirmation: false,
      workspaceId: ctx.workspace.id,
      agentId,
      ...(generated.modelId ? { modelId: generated.modelId } : {}),
      // A proposal plans; it changes no venture state. The only write is this
      // ledger row itself.
      effect: { kind: "db_write", operation: "plan", target: "venture_score_proposal" },
      metadata: buildProposalLedgerMetadata(proposal, unresolved),
    });
  } catch {
    return {
      status: "skipped",
      ventureId: venture.id,
      reason: "shadow log write failed",
    };
  }

  return { status: "proposed", proposal, unresolved };
}

export type ShadowPassResult = {
  workspaceId: string;
  considered: number;
  proposed: ShadowProposalOutcome[];
};

/**
 * Runs a shadow pass over every venture still at `candidate`.
 *
 * Only `candidate` ventures are scored: past that status the owner has already
 * ruled, and there is no decision left to compare a proposal against.
 */
export async function runShadowScorePass(
  ctx: WorkspaceContext,
  deps: ShadowRunnerDeps = {},
): Promise<ShadowPassResult> {
  const list = deps.listVentures ?? listVenturesForWorkspace;

  let ventures: VentureCard[];
  try {
    ventures = await list(ctx.workspace.id);
  } catch {
    return { workspaceId: ctx.workspace.id, considered: 0, proposed: [] };
  }

  const candidates = ventures.filter((venture) => venture.status === "candidate");
  const proposed: ShadowProposalOutcome[] = [];

  for (const venture of candidates) {
    proposed.push(await runShadowProposalForVenture(ctx, venture, deps));
  }

  return { workspaceId: ctx.workspace.id, considered: candidates.length, proposed };
}

// ---------------------------------------------------------------------------
// Outcome — the owner's real decision, and the divergence
// ---------------------------------------------------------------------------

/**
 * Records the owner's actual score against an earlier proposal.
 *
 * This is the half that makes shadow mode worth running: a proposal alone
 * proves nothing, and only the measured gap between agent and owner can justify
 * granting autonomy later. Best-effort — a failed write returns false rather
 * than disturbing the scoring the owner just did.
 */
export async function recordShadowOutcome(
  ctx: WorkspaceContext,
  proposal: VentureScoreProposal,
  actual: VentureScore,
  deps: ShadowRunnerDeps = {},
): Promise<boolean> {
  const record = deps.recordEvent ?? recordLedgerEvent;
  const divergence = measureProposalDivergence(proposal, actual);

  try {
    await record(ctx, {
      eventType: "learning",
      actionType: SHADOW_OUTCOME_ACTION_TYPE,
      summary:
        `Écart agent/CEO pour ${proposal.ventureId} : ` +
        `${divergence.recommendationAgreed ? "même verdict" : "verdicts divergents"}, ` +
        `écart moyen ${divergence.meanAbsoluteDelta}/10 sur ${divergence.disagreements.length} dimension(s).`,
      autonomyLevel: SHADOW_AUTONOMY_LEVEL,
      requiresConfirmation: false,
      workspaceId: ctx.workspace.id,
      agentId: proposal.proposedBy,
      effect: { kind: "db_write", operation: "plan", target: "venture_score_outcome" },
      metadata: {
        // The pairing. Without it an outcome cannot name WHICH proposal it
        // measured when a venture has been proposed on more than one day.
        proposalId: proposal.proposalId,
        ventureId: proposal.ventureId,
        proposedOverall: proposal.score.overallScore,
        actualOverall: actual.overallScore,
        proposedRecommendation: divergence.proposedRecommendation,
        actualRecommendation: divergence.actualRecommendation,
        recommendationAgreed: divergence.recommendationAgreed,
        meanAbsoluteDelta: divergence.meanAbsoluteDelta,
        disagreements: divergence.disagreements.map((item) => ({
          dimension: item.dimension,
          proposed: item.proposed,
          actual: item.actual,
          delta: item.delta,
        })),
      },
    });
    return true;
  } catch {
    return false;
  }
}
