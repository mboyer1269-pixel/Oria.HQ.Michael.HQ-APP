// src/features/ventures/venture-council-cash-run-composer.ts
//
// Venture-specific composer: wires CashActionPacket into the generic Agent
// Council Run contract (src/server/agents). Does not duplicate council logic,
// mandate mapping, money-strategy mapping, or deriveCouncilDecision.

import type { CashActionPacket } from "./cash-action-packet";
import { isCashFinancialSignalType, validateCashActionPacket } from "./cash-action-packet";
import type { EvidenceKind } from "./evidence-ref";
import { VERIFIED_FINANCIAL_KINDS } from "./evidence-ref";
import type {
  AgentCouncilEvidenceRef,
  AgentCouncilRun,
  AgentCouncilTurn,
  AgentCouncilVerdict,
  AgentCouncilMoneyStrategyInput,
} from "@/server/agents/agent-council-run-contract";
import {
  appendAgentCouncilTurn,
  buildAgentCouncilRun,
  buildAgentCouncilTurn,
  buildAgentCouncilVerdict,
} from "@/server/agents/agent-council-run-contract";
import type { BuildNextActionMandateInput } from "@/server/agents/next-action-mandate-contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VentureCouncilCashRunReadiness =
  | "ready_for_ceo"
  | "needs_more_evidence"
  | "blocked_by_auditor"
  | "needs_refinement";

export interface VentureCouncilCashRunComposerInput {
  runId: string;
  cashActionPacket: CashActionPacket;
  objective?: string;
  createdAt?: string;
}

export interface VentureCouncilCashRunComposerResult {
  run: AgentCouncilRun;
  turns: AgentCouncilTurn[];
  verdict: AgentCouncilVerdict;
  nextActionMandateInput: BuildNextActionMandateInput;
  moneyStrategyInput: AgentCouncilMoneyStrategyInput;
  readiness: VentureCouncilCashRunReadiness;
  recommendedManualAction: string;
  requiredEvidence: string[];
  noExecutionAuthorized: true;
  humanOnTheLoop: true;
}

// ---------------------------------------------------------------------------
// Heuristic constants (deterministic packet analysis only)
// ---------------------------------------------------------------------------

const LOW_TRUST_EVIDENCE: ReadonlySet<EvidenceKind> = new Set([
  "manual_note",
  "self_reported",
]);

const EXTERNAL_EXECUTION_PATTERNS: readonly RegExp[] = [
  /\bsend\s+(?:now|automatically|immediately)\b/i,
  /\bauto[\s-]?send\b/i,
  /\bdeploy\s+now\b/i,
  /\bexecute\s+now\b/i,
  /\bpublish\s+now\b/i,
  /\bruntime\s+dispatch\b/i,
  /\bcontact\s+(?:the\s+)?customer\s+automatically\b/i,
];

const FAKE_CASH_CLAIM_PATTERNS: readonly RegExp[] = [
  /\b(?:already|confirmed)\s+(?:paid|revenue|cash)\b/i,
  /\bverified\s+stripe\s+charge\b/i,
  /\bcash\s+already\s+collected\b/i,
];

const ROLE_SEQUENCE = [
  "orient",
  "t_gravity",
  "hermes",
  "auditor",
  "operator",
] as const;

// ---------------------------------------------------------------------------
// Packet analysis (venture-local heuristics only)
// ---------------------------------------------------------------------------

interface PacketCouncilAnalysis {
  evidenceRefs: AgentCouncilEvidenceRef[];
  weakEvidence: boolean;
  fakeCashRisk: boolean;
  externalExecutionRisk: boolean;
  roiMultiple: number;
  lowRoi: boolean;
  criticalRoi: boolean;
  packetValid: boolean;
}

function packetTextHaystack(packet: CashActionPacket): string {
  return [
    packet.outreachDraft,
    packet.callToAction,
    packet.offer,
    packet.painHypothesis,
  ].join("\n");
}

function hasVerifiedFinancialEvidenceRequired(packet: CashActionPacket): boolean {
  return packet.requiredEvidence.some((kind) => VERIFIED_FINANCIAL_KINDS.includes(kind));
}

function hasOnlyLowTrustEvidence(packet: CashActionPacket): boolean {
  if (packet.requiredEvidence.length === 0) return true;
  return packet.requiredEvidence.every((kind) => LOW_TRUST_EVIDENCE.has(kind));
}

function detectExternalExecutionRisk(packet: CashActionPacket): boolean {
  const haystack = packetTextHaystack(packet);
  return EXTERNAL_EXECUTION_PATTERNS.some((pattern) => pattern.test(haystack));
}

function detectFakeCashRisk(packet: CashActionPacket): boolean {
  const haystack = packetTextHaystack(packet);
  const claimsCashWithoutProof =
    FAKE_CASH_CLAIM_PATTERNS.some((pattern) => pattern.test(haystack)) &&
    !hasVerifiedFinancialEvidenceRequired(packet);
  const financialSignalWithoutFinancialEvidence =
    isCashFinancialSignalType(packet.expectedCashSignal) && hasOnlyLowTrustEvidence(packet);
  return claimsCashWithoutProof || financialSignalWithoutFinancialEvidence;
}

function buildEvidenceRefs(packet: CashActionPacket): AgentCouncilEvidenceRef[] {
  return packet.requiredEvidence.map((kind, index) => ({
    kind,
    referenceId: `${packet.packetId}_evidence_${index + 1}`,
    summary: `Required ${kind} for expected signal ${packet.expectedCashSignal}`,
    isVerified: VERIFIED_FINANCIAL_KINDS.includes(kind),
  }));
}

function analyzePacket(packet: CashActionPacket): PacketCouncilAnalysis {
  const validation = validateCashActionPacket(packet);
  const roiMultiple = packet.expectedRoiMultiple;
  const weakEvidence =
    hasOnlyLowTrustEvidence(packet) ||
    (!hasVerifiedFinancialEvidenceRequired(packet) &&
      !isCashFinancialSignalType(packet.expectedCashSignal));

  return {
    evidenceRefs: buildEvidenceRefs(packet),
    weakEvidence,
    fakeCashRisk: detectFakeCashRisk(packet),
    externalExecutionRisk: detectExternalExecutionRisk(packet),
    roiMultiple,
    lowRoi: roiMultiple > 0 && roiMultiple < 3,
    criticalRoi: roiMultiple >= 0 && roiMultiple < 1,
    packetValid: validation.valid,
  };
}

function turnTimestamp(baseIso: string, index: number): string {
  const baseMs = Date.parse(baseIso);
  return new Date(baseMs + (index + 1) * 60_000).toISOString();
}

function turnIdFor(runId: string, roleId: string): string {
  return `${runId}_turn_${roleId}`;
}

// ---------------------------------------------------------------------------
// Turn builders (deterministic summaries from packet fields)
// ---------------------------------------------------------------------------

function buildOrientTurn(
  runId: string,
  packet: CashActionPacket,
  analysis: PacketCouncilAnalysis,
  createdAt: string,
): ReturnType<typeof buildAgentCouncilTurn> {
  const offerClarity =
    packet.offer.trim().length >= 20 && packet.callToAction.trim().length >= 10
      ? "offer and CTA are concrete enough to test"
      : "offer or CTA needs sharper specificity";

  return buildAgentCouncilTurn({
    turnId: turnIdFor(runId, "orient"),
    runId,
    roleId: "orient",
    inputSummary: `Orient buyer context for ${packet.targetBuyer}`,
    outputSummary: [
      `Buyer: ${packet.targetBuyer} (${packet.buyerType}).`,
      `Pain: ${packet.painHypothesis}`,
      `Offer clarity: ${offerClarity}.`,
    ].join(" "),
    recommendation: analysis.weakEvidence ? "refine" : "support",
    confidenceScore: analysis.weakEvidence ? 48 : 72,
    riskFlags: analysis.weakEvidence ? ["weak_buyer_clarity"] : [],
    evidenceRefs: analysis.evidenceRefs,
    status: "completed",
    createdAt,
  });
}

function buildGravityTurn(
  runId: string,
  packet: CashActionPacket,
  analysis: PacketCouncilAnalysis,
  createdAt: string,
): ReturnType<typeof buildAgentCouncilTurn> {
  let recommendation: "proceed" | "refine" | "pause" | "kill_candidate" = "proceed";
  const riskFlags: string[] = [];

  if (analysis.criticalRoi) {
    recommendation = "kill_candidate";
    riskFlags.push("low_roi", "kill_candidate_recommendation_only");
  } else if (analysis.lowRoi || analysis.weakEvidence) {
    recommendation = "refine";
    riskFlags.push(analysis.lowRoi ? "low_roi" : "weak_evidence");
  }

  return buildAgentCouncilTurn({
    turnId: turnIdFor(runId, "t_gravity"),
    runId,
    roleId: "t_gravity",
    inputSummary: "Evaluate ROI, evidence quality, speed-to-cash, and risk",
    outputSummary: [
      `ROI multiple ${analysis.roiMultiple} on impact ${packet.expectedCashImpactCents}c vs cost ${packet.expectedCostCents}c.`,
      "Speed-to-cash favors a bounded pilot before scale.",
      analysis.weakEvidence
        ? "Evidence is too weak to treat cash as proven — refine before scaling."
        : "Evidence plan is acceptable for a CEO-reviewed pilot.",
      "No invented cash proof in this turn.",
    ].join(" "),
    recommendation,
    confidenceScore: analysis.criticalRoi ? 35 : analysis.weakEvidence ? 52 : 78,
    riskFlags,
    evidenceRefs: analysis.evidenceRefs,
    status: "completed",
    createdAt,
  });
}

function buildHermesTurn(
  runId: string,
  packet: CashActionPacket,
  analysis: PacketCouncilAnalysis,
  createdAt: string,
): ReturnType<typeof buildAgentCouncilTurn> {
  const channel =
    packet.expectedCashSignal === "email_reply"
      ? "email_reply"
      : packet.expectedCashSignal === "meeting_booked"
        ? "calendar_meeting"
        : "ceo_manual_outreach";

  return buildAgentCouncilTurn({
    turnId: turnIdFor(runId, "hermes"),
    runId,
    roleId: "hermes",
    inputSummary: "Prepare outreach and operator path without sending",
    outputSummary: [
      `Prepare ${channel} outreach for ${packet.targetBuyer}.`,
      `Draft ready for CEO adaptation: "${packet.outreachDraft.slice(0, 120)}${packet.outreachDraft.length > 120 ? "…" : ""}"`,
      `CTA to use manually: ${packet.callToAction}`,
      "Hermès prepares only — no send and no automated delivery.",
    ].join(" "),
    recommendation: analysis.externalExecutionRisk ? "refine" : "support",
    confidenceScore: 70,
    riskFlags: analysis.externalExecutionRisk ? ["outreach_execution_language"] : [],
    evidenceRefs: [],
    status: "completed",
    createdAt,
  });
}

function buildAuditorTurn(
  runId: string,
  packet: CashActionPacket,
  analysis: PacketCouncilAnalysis,
  createdAt: string,
): ReturnType<typeof buildAgentCouncilTurn> {
  const riskFlags: string[] = [];
  let recommendation: "proceed" | "refine" | "veto" | "needs_ceo_decision" = "proceed";

  if (!analysis.packetValid) {
    recommendation = "veto";
    riskFlags.push("auditor_veto", "invalid_packet");
  } else if (analysis.fakeCashRisk) {
    recommendation = "veto";
    riskFlags.push("auditor_veto", "fake_cash_risk");
  } else if (analysis.externalExecutionRisk) {
    recommendation = "veto";
    riskFlags.push("auditor_veto", "external_execution_boundary");
  } else if (packet.requiresCeoApproval) {
    riskFlags.push("ceo_approval_required");
  }

  return buildAgentCouncilTurn({
    turnId: turnIdFor(runId, "auditor"),
    runId,
    roleId: "auditor",
    inputSummary: "Audit evidence, compliance, and execution boundaries",
    outputSummary: [
      `Packet ${packet.packetId} remains proposal-only (noExecutionAuthorized).`,
      analysis.fakeCashRisk
        ? "Auditor flags possible fake or overstated cash proof."
        : "No fake-cash pattern detected in required evidence plan.",
      analysis.externalExecutionRisk
        ? "Language implies external execution — blocked pending CEO review."
        : "No forbidden auto-send or runtime dispatch language detected.",
    ].join(" "),
    recommendation,
    confidenceScore: recommendation === "veto" ? 88 : 75,
    riskFlags,
    evidenceRefs: analysis.evidenceRefs,
    status: "completed",
    createdAt,
  });
}

function buildOperatorTurn(
  runId: string,
  packet: CashActionPacket,
  priorTurns: AgentCouncilTurn[],
  createdAt: string,
): ReturnType<typeof buildAgentCouncilTurn> {
  const auditorVetoed = priorTurns.some(
    (turn) =>
      turn.roleId === "auditor" &&
      (turn.recommendation === "veto" || turn.riskFlags.includes("auditor_veto")),
  );

  return buildAgentCouncilTurn({
    turnId: turnIdFor(runId, "operator"),
    runId,
    roleId: "operator",
    inputSummary: "Prepare next-work handoff for CEO manual execution",
    outputSummary: auditorVetoed
      ? "Hold handoff until CEO resolves auditor blockers. Prepare checklist only."
      : [
          `Handoff: CEO manually executes outreach to ${packet.targetBuyer}.`,
          `Validate ${packet.expectedCashSignal} with required evidence kinds.`,
          "Operator prepares work only — no runtime dispatch.",
        ].join(" "),
    recommendation: auditorVetoed ? "pause" : "proceed",
    confidenceScore: auditorVetoed ? 60 : 74,
    riskFlags: auditorVetoed ? ["awaiting_ceo_after_audit"] : [],
    evidenceRefs: [],
    status: "completed",
    createdAt,
  });
}

function deriveReadiness(
  verdict: AgentCouncilVerdict,
  turns: AgentCouncilTurn[],
  analysis: PacketCouncilAnalysis,
): VentureCouncilCashRunReadiness {
  const auditorBlocked = turns.some(
    (turn) =>
      turn.roleId === "auditor" &&
      turn.status === "completed" &&
      (turn.recommendation === "veto" ||
        turn.recommendation === "needs_ceo_decision" ||
        turn.riskFlags.includes("auditor_veto")),
  );

  if (auditorBlocked) {
    return "blocked_by_auditor";
  }

  if (verdict.decision === "needs_ceo_decision") {
    return "ready_for_ceo";
  }

  if (analysis.weakEvidence) {
    return "needs_more_evidence";
  }

  if (verdict.decision === "refine" || verdict.decision === "pause") {
    return "needs_refinement";
  }

  if (verdict.decision === "kill_candidate") {
    return "ready_for_ceo";
  }

  if (verdict.decision === "proceed") {
    return "ready_for_ceo";
  }

  return "needs_refinement";
}

function buildRecommendedManualAction(
  packet: CashActionPacket,
  readiness: VentureCouncilCashRunReadiness,
): string {
  switch (readiness) {
    case "blocked_by_auditor":
      return `Review packet ${packet.packetId} with the auditor flags before any outreach. Do not auto-send or dispatch runtime.`;
    case "needs_more_evidence":
      return `Strengthen evidence for ${packet.targetBuyer}: collect ${packet.requiredEvidence.join(", ")} before executing "${packet.callToAction}".`;
    case "needs_refinement":
      return `Refine the offer and proof plan for ${packet.targetBuyer}, then re-run council on an updated packet.`;
    case "ready_for_ceo":
    default:
      return `CEO manually adapts and sends the outreach draft to ${packet.targetBuyer}, then tracks ${packet.expectedCashSignal}.`;
  }
}

function requiredEvidenceLabels(packet: CashActionPacket): string[] {
  return packet.requiredEvidence.map((kind) => String(kind));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Composes a full Agent Council Run from a CashActionPacket using the
 * existing server/agents council contract helpers only.
 */
export function composeVentureCouncilCashRun(
  input: VentureCouncilCashRunComposerInput,
): VentureCouncilCashRunComposerResult {
  const packet = input.cashActionPacket;
  const createdAt = input.createdAt ?? packet.createdAt;
  const objective =
    input.objective ??
    `Council cash review for packet ${packet.packetId}: ${packet.offer}`;

  const analysis = analyzePacket(packet);

  let run = buildAgentCouncilRun({
    runId: input.runId,
    objective,
    sourceType: "cash_action_packet",
    sourceId: packet.packetId,
    ventureId: packet.ventureId,
    status: "running",
    rolesRequested: [...ROLE_SEQUENCE],
    createdAt,
    updatedAt: createdAt,
  });

  const builtTurns: AgentCouncilTurn[] = [];

  ROLE_SEQUENCE.forEach((roleId, index) => {
    const at = turnTimestamp(createdAt, index);
    let turn: AgentCouncilTurn;

    switch (roleId) {
      case "orient":
        turn = buildOrientTurn(input.runId, packet, analysis, at);
        break;
      case "t_gravity":
        turn = buildGravityTurn(input.runId, packet, analysis, at);
        break;
      case "hermes":
        turn = buildHermesTurn(input.runId, packet, analysis, at);
        break;
      case "auditor":
        turn = buildAuditorTurn(input.runId, packet, analysis, at);
        break;
      case "operator":
        turn = buildOperatorTurn(input.runId, packet, builtTurns, at);
        break;
      default:
        throw new Error(`Unexpected council role: ${roleId}`);
    }

    run = appendAgentCouncilTurn(run, turn);
    builtTurns.push(turn);
  });

  const turns = run.turns;
  const recommendedAction = `CEO-reviewed manual execution: ${packet.callToAction}`;

  const verdict = buildAgentCouncilVerdict({
    verdictId: `${input.runId}_verdict`,
    runId: input.runId,
    recommendedAction,
    turns,
    run: {
      runId: input.runId,
      ventureId: packet.ventureId,
      sourceId: packet.packetId,
      sourceType: "cash_action_packet",
      objective,
    },
    selectedContributions: turns.map((turn) => `${turn.roleId}: ${turn.outputSummary}`),
    counterProposals:
      analysis.weakEvidence || analysis.lowRoi
        ? [`Collect stronger ${packet.requiredEvidence.join(", ")} before scaling outreach.`]
        : [],
    riskFlags: [
      ...new Set(turns.flatMap((turn) => turn.riskFlags)),
    ],
  });

  if (!verdict.nextMandateInput || !verdict.moneyStrategyInput) {
    throw new Error("composeVentureCouncilCashRun: verdict mappers did not populate bridge inputs");
  }

  const readiness = deriveReadiness(verdict, turns, analysis);

  const finalRun: AgentCouncilRun = {
    ...run,
    finalVerdict: verdict,
    status: readiness === "blocked_by_auditor" ? "blocked" : "ready_for_ceo",
    updatedAt: turnTimestamp(createdAt, ROLE_SEQUENCE.length),
  };

  return {
    run: finalRun,
    turns,
    verdict,
    nextActionMandateInput: verdict.nextMandateInput,
    moneyStrategyInput: verdict.moneyStrategyInput,
    readiness,
    recommendedManualAction: buildRecommendedManualAction(packet, readiness),
    requiredEvidence: requiredEvidenceLabels(packet),
    noExecutionAuthorized: true,
    humanOnTheLoop: true,
  };
}
