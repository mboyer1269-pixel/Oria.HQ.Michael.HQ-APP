// src/features/ventures/hermes-outreach-plan.ts
//
// Pure model for Relay (agent id `hermes`) as an OUTREACH OPERATOR (v0). It turns a
// CashActionPacket (the approved cash proposal) into a structured outreach
// plan a human can review and execute BY HAND: which channel, which sender,
// who to look for, what to say, what proof to capture.
//
// Hard boundary: Relay PREPARES. Michael APPROVES and SENDS. The plan never
// executes, never sends, never contacts a prospect, never scrapes, never
// spends. requiresCeoApproval, requiresManualSend and noExecutionAuthorized
// are locked to literal true and there is no send / execute / dispatch path.
//
// No invented reality: the plan never fabricates a real prospect or a real
// email address. When the source packet carries only a buyer SEGMENT (which
// is all a CashActionPacket ever carries), the plan explicitly requires
// manual prospect selection rather than making someone up.
//
// Dependency-free and pure: no Supabase, no database, no network, no UI, no
// AI/LLM, no provider, no scoring, no persistence, no runtime execution. It
// reuses the cash signal taxonomy and evidence kinds already defined in the
// Ventures domain so expected signals stay compatible with the cash loop.
// Validation follows the hand-rolled { valid, errors } style of the adjacent
// modules (cash-action-packet.ts, evidence-ref.ts).

import type { CashActionPacket, CashSignalType } from "./cash-action-packet";
import { CASH_SIGNAL_TYPES } from "./cash-action-packet";
import type { EvidenceKind } from "./evidence-ref";
import { EVIDENCE_KINDS } from "./evidence-ref";

// ---------------------------------------------------------------------------
// SECTION A — Channels
// ---------------------------------------------------------------------------

// The outreach surfaces Relay can recommend. "manual" is the always-safe
// default: the CEO picks the surface himself.
export type HermesOutreachChannel =
  | "email"
  | "x_dm"
  | "linkedin"
  | "indie_hackers"
  | "reddit"
  | "manual";

export const HERMES_OUTREACH_CHANNELS: readonly HermesOutreachChannel[] = [
  "email",
  "x_dm",
  "linkedin",
  "indie_hackers",
  "reddit",
  "manual",
];

// Channels that legally/ethically demand explicit compliance notes before any
// human send. Email is the canonical one (CAN-SPAM / GDPR / opt-out duties);
// kept as a set so the rule can extend without touching validation logic.
export const CHANNELS_REQUIRING_COMPLIANCE_NOTES: readonly HermesOutreachChannel[] = [
  "email",
];

export function channelRequiresComplianceNotes(channel: HermesOutreachChannel): boolean {
  return CHANNELS_REQUIRING_COMPLIANCE_NOTES.includes(channel);
}

// ---------------------------------------------------------------------------
// SECTION B — Approval status
// ---------------------------------------------------------------------------

// The plan's lifecycle, all human-gated. There is intentionally no "sent" or
// "executing" state — sending happens outside this model, by hand.
export type HermesPlanApprovalStatus =
  | "draft"
  | "ready_for_ceo_approval"
  | "approved_for_manual_send"
  | "rejected";

export const HERMES_PLAN_APPROVAL_STATUSES: readonly HermesPlanApprovalStatus[] = [
  "draft",
  "ready_for_ceo_approval",
  "approved_for_manual_send",
  "rejected",
];

// ---------------------------------------------------------------------------
// SECTION C — The HermesOutreachPlan type
// ---------------------------------------------------------------------------

export type HermesOutreachPlan = {
  planId: string;
  cashActionPacketId: string;
  ventureId?: string;

  channel: HermesOutreachChannel;

  // Operator preparation — concrete enough for a human to act on by hand.
  senderRecommendation: string;
  prospectProfile: string;
  prospectSelectionCriteria: string;
  personalizationBasis: string;

  // The literal message Michael can copy, adapt and send HIMSELF. Draft only.
  messageDraft: string;
  cta: string;

  // What signal we expect back, and what proof would make it real. The signal
  // is drawn from the shared cash taxonomy so it stays loop-compatible.
  expectedSignal: CashSignalType;
  requiredEvidence: EvidenceKind[];

  // Guardrails for the human operator.
  complianceNotes: string;
  riskNotes: string;
  manualSendInstructions: string;

  approvalStatus: HermesPlanApprovalStatus;

  createdAt: string;

  // Governance locks — always literal true.
  requiresCeoApproval: true;
  requiresManualSend: true;
  noExecutionAuthorized: true;
};

// ---------------------------------------------------------------------------
// SECTION D — Constants
// ---------------------------------------------------------------------------

// A draft / personalization basis shorter than this is too thin to act on.
export const HERMES_MIN_TEXT_LENGTH = 10;

// The exact phrase used whenever no real prospect exists yet. Callers and
// tests both assert on this literal, so it lives here as the single source.
export const MANUAL_PROSPECT_SELECTION_REQUIRED = "manual prospect selection required";

// Detects a concrete email address. Used to guarantee the plan never invents a
// real prospect email in the prospect-targeting fields.
const EMAIL_ADDRESS_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

// ---------------------------------------------------------------------------
// SECTION E — Validation
// ---------------------------------------------------------------------------

export type HermesOutreachPlanValidation = {
  valid: boolean;
  errors: string[];
};

function requireText(
  value: unknown,
  field: string,
  errors: string[],
  minLength = 1,
): void {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} must be non-empty`);
  } else if (value.trim().length < minLength) {
    errors.push(`${field} is too thin (min ${minLength} characters)`);
  }
}

export function validateHermesOutreachPlan(
  plan: HermesOutreachPlan,
): HermesOutreachPlanValidation {
  const errors: string[] = [];

  // Identity.
  requireText(plan.planId, "planId", errors);
  requireText(plan.cashActionPacketId, "cashActionPacketId", errors);
  // ventureId is optional, but if present it must be a real non-empty string.
  if (plan.ventureId !== undefined) {
    requireText(plan.ventureId, "ventureId", errors);
  }

  // Channel.
  if (!HERMES_OUTREACH_CHANNELS.includes(plan.channel)) {
    errors.push("channel must be a known outreach channel");
  }

  // Operator preparation — must be concrete.
  requireText(plan.senderRecommendation, "senderRecommendation", errors);
  requireText(plan.prospectProfile, "prospectProfile", errors);
  requireText(plan.prospectSelectionCriteria, "prospectSelectionCriteria", errors);
  requireText(plan.personalizationBasis, "personalizationBasis", errors, HERMES_MIN_TEXT_LENGTH);

  // Message — present and copy-ready, but only ever a draft (data, not a send).
  requireText(plan.messageDraft, "messageDraft", errors, HERMES_MIN_TEXT_LENGTH);
  requireText(plan.cta, "cta", errors);

  // Expected signal must be compatible with the existing cash signal taxonomy.
  if (!CASH_SIGNAL_TYPES.includes(plan.expectedSignal)) {
    errors.push("expectedSignal must be a known cash signal type");
  }

  // Required evidence — never empty, every kind known.
  if (!Array.isArray(plan.requiredEvidence)) {
    errors.push("requiredEvidence must be an array");
  } else {
    if (plan.requiredEvidence.length === 0) {
      errors.push("requiredEvidence must list at least one evidence kind");
    }
    plan.requiredEvidence.forEach((kind, i) => {
      if (!EVIDENCE_KINDS.includes(kind)) {
        errors.push(`requiredEvidence[${i}] must be a known evidence kind`);
      }
    });
  }

  // Guardrails. Compliance notes are mandatory on channels that demand them
  // (email); risk notes and manual send instructions are always required so a
  // human never executes without explicit guidance.
  if (channelRequiresComplianceNotes(plan.channel)) {
    requireText(
      plan.complianceNotes,
      `complianceNotes (required for channel "${plan.channel}")`,
      errors,
    );
  } else if (typeof plan.complianceNotes !== "string") {
    errors.push("complianceNotes must be a string");
  }
  requireText(plan.riskNotes, "riskNotes", errors);
  requireText(plan.manualSendInstructions, "manualSendInstructions", errors);

  // No invented prospect: the targeting fields must not carry a real email
  // address. A real outreach target is selected by a human, never fabricated.
  if (
    typeof plan.prospectProfile === "string" &&
    EMAIL_ADDRESS_PATTERN.test(plan.prospectProfile)
  ) {
    errors.push("prospectProfile must not contain a fabricated email address");
  }
  if (
    typeof plan.prospectSelectionCriteria === "string" &&
    EMAIL_ADDRESS_PATTERN.test(plan.prospectSelectionCriteria)
  ) {
    errors.push("prospectSelectionCriteria must not contain a fabricated email address");
  }

  // Approval status.
  if (!HERMES_PLAN_APPROVAL_STATUSES.includes(plan.approvalStatus)) {
    errors.push("approvalStatus must be a known approval status");
  }

  // createdAt — valid ISO string.
  if (typeof plan.createdAt !== "string" || isNaN(+new Date(plan.createdAt))) {
    errors.push("createdAt must be a valid ISO date string");
  }

  // Governance locks — Relay prepares, the CEO approves, a human sends, and
  // nothing executes automatically. All three are non-negotiable.
  if (plan.requiresCeoApproval !== true) {
    errors.push("requiresCeoApproval must be true");
  }
  if (plan.requiresManualSend !== true) {
    errors.push("requiresManualSend must be true");
  }
  if (plan.noExecutionAuthorized !== true) {
    errors.push("noExecutionAuthorized must be true");
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// SECTION F — Governance predicates
// ---------------------------------------------------------------------------

// Always true for a well-formed plan — Relay output is never CEO-optional.
export function hermesPlanRequiresCeoApproval(plan: HermesOutreachPlan): boolean {
  return plan.requiresCeoApproval === true;
}

// The single gate for "is a human allowed to send this now?". It requires all
// governance locks AND an explicit CEO approval status. It can never authorize
// automated sending — the plan stays manual by construction.
export function hermesPlanCanBeManuallySent(plan: HermesOutreachPlan): boolean {
  return (
    plan.requiresCeoApproval === true &&
    plan.requiresManualSend === true &&
    plan.noExecutionAuthorized === true &&
    plan.approvalStatus === "approved_for_manual_send"
  );
}

// ---------------------------------------------------------------------------
// SECTION G — Builder
// ---------------------------------------------------------------------------

// The build boundary accepts everything except the governance locks, which the
// builder forces to true so a plan can never be constructed in an executable or
// auto-send state.
export type BuildHermesOutreachPlanInput = Omit<
  HermesOutreachPlan,
  "requiresCeoApproval" | "requiresManualSend" | "noExecutionAuthorized" | "requiredEvidence"
> & {
  requiredEvidence: readonly EvidenceKind[];
};

export function buildHermesOutreachPlan(
  input: BuildHermesOutreachPlanInput,
): HermesOutreachPlan {
  const plan: HermesOutreachPlan = {
    planId: input.planId,
    cashActionPacketId: input.cashActionPacketId,
    channel: input.channel,
    senderRecommendation: input.senderRecommendation,
    prospectProfile: input.prospectProfile,
    prospectSelectionCriteria: input.prospectSelectionCriteria,
    personalizationBasis: input.personalizationBasis,
    messageDraft: input.messageDraft,
    cta: input.cta,
    expectedSignal: input.expectedSignal,
    requiredEvidence: [...input.requiredEvidence],
    complianceNotes: input.complianceNotes,
    riskNotes: input.riskNotes,
    manualSendInstructions: input.manualSendInstructions,
    approvalStatus: input.approvalStatus,
    createdAt: input.createdAt,
    requiresCeoApproval: true,
    requiresManualSend: true,
    noExecutionAuthorized: true,
  };
  // Only attach ventureId when present, so the optional field stays absent
  // rather than becoming an explicit `undefined` (keeps output deterministic).
  if (input.ventureId !== undefined) {
    plan.ventureId = input.ventureId;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// SECTION H — From a CashActionPacket
// ---------------------------------------------------------------------------

// Optional overrides for the packet → plan transform. Everything is optional:
// the transform is fully deterministic and produces a safe plan with no
// overrides at all.
export type BuildHermesOutreachPlanFromCashActionPacketOptions = {
  planId?: string;
  channel?: HermesOutreachChannel;
  senderRecommendation?: string;
  complianceNotes?: string;
  riskNotes?: string;
  manualSendInstructions?: string;
  approvalStatus?: HermesPlanApprovalStatus;
  // Extra human-selection criteria appended after the mandatory manual-selection
  // requirement (never replaces it).
  additionalProspectSelectionCriteria?: string;
  createdAt?: string;
};

// Map an expected cash signal onto the most natural outreach channel. Anything
// without an obvious surface falls back to "manual" so the CEO chooses.
function defaultChannelForSignal(signal: CashSignalType): HermesOutreachChannel {
  switch (signal) {
    case "email_reply":
      return "email";
    case "meeting_booked":
    case "verbal_commitment":
    case "signed_loi":
    case "stripe_charge":
    case "manual_note":
    default:
      return "manual";
  }
}

function defaultComplianceNotesForChannel(channel: HermesOutreachChannel): string {
  if (channel === "email") {
    return (
      "Email outreach: send only to prospects with a lawful basis to contact, " +
      "use the CEO's real identity, include a clear opt-out, and honor any " +
      "unsubscribe immediately. No purchased lists, no spoofing, no automation."
    );
  }
  return (
    "Follow each platform's terms and anti-spam rules. Personalize, do not mass " +
    "message, and respect any prior opt-out before contacting a prospect."
  );
}

// Turn an approved cash proposal into a ready-to-review outreach plan. Pure and
// deterministic: it copies the packet's own words, never invents a prospect or
// an email, and always requires manual prospect selection because a packet only
// ever describes a buyer SEGMENT, not a real named person.
export function buildHermesOutreachPlanFromCashActionPacket(
  packet: CashActionPacket,
  options: BuildHermesOutreachPlanFromCashActionPacketOptions = {},
): HermesOutreachPlan {
  const channel = options.channel ?? defaultChannelForSignal(packet.expectedCashSignal);

  // A CashActionPacket carries a buyer segment, never a real prospect, so the
  // selection criteria always lead with the explicit manual requirement.
  const baseCriteria =
    `${MANUAL_PROSPECT_SELECTION_REQUIRED}: hand-pick real prospects matching ` +
    `"${packet.targetBuyer}" (${packet.buyerType}). No prospect is fabricated here.`;
  const prospectSelectionCriteria = options.additionalProspectSelectionCriteria
    ? `${baseCriteria} ${options.additionalProspectSelectionCriteria}`
    : baseCriteria;

  return buildHermesOutreachPlan({
    planId: options.planId ?? `${packet.packetId}_hermes_outreach_plan`,
    cashActionPacketId: packet.packetId,
    ventureId: packet.ventureId,
    channel,
    senderRecommendation:
      options.senderRecommendation ??
      "Send manually from the CEO's own verified identity — no shared, automated, or impersonated sender.",
    prospectProfile: `${packet.targetBuyer} (${packet.buyerType})`,
    prospectSelectionCriteria,
    personalizationBasis: packet.painHypothesis,
    messageDraft: packet.outreachDraft,
    cta: packet.callToAction,
    expectedSignal: packet.expectedCashSignal,
    requiredEvidence: packet.requiredEvidence,
    complianceNotes: options.complianceNotes ?? defaultComplianceNotesForChannel(channel),
    riskNotes:
      options.riskNotes ??
      "Relay prepared this plan only. Verify the prospect is real and reachable, " +
        "keep claims truthful, and never overstate outcomes.",
    manualSendInstructions:
      options.manualSendInstructions ??
      `Copy the message draft, personalize it per the personalization basis, send it ` +
        `yourself via ${channel}, then capture the required evidence for ${packet.expectedCashSignal}.`,
    approvalStatus: options.approvalStatus ?? "ready_for_ceo_approval",
    createdAt: options.createdAt ?? packet.createdAt,
  });
}
