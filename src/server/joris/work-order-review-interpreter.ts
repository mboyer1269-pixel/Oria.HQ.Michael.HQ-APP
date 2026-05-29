// src/server/joris/work-order-review-interpreter.ts

/**
 * Pure interpreter that converts a natural-language review message from the
 * Workflow Owner (CEO / Human-on-the-Loop) into a structured Work Order
 * Review interpretation compatible with the Work Order Human Review Contract.
 *
 * This module is entirely side-effect free:
 *   - No I/O, no DB writes, no runtime dispatch.
 *   - No calendar booking, no outreach, no publishing.
 *   - No mutations of input objects.
 *
 * The interpreter uses static heuristic keyword matching. It will be
 * enhanced with AI-assisted interpretation in a future PR once wired
 * into brain.ts.
 */

import type {
  WorkOrderReviewDecision,
  WorkOrderReviewActorRole,
  WorkOrderRequestedChange,
  WorkOrderApprovalGateAcknowledgement,
  WorkOrderReviewIssue,
} from "../agents/work-order-review-contract";

import type { ApprovalGate } from "../agents/agent-profile-contract";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface WorkOrderReviewInput {
  /** The natural-language message from the reviewer */
  message: string;
  /** The Work Order being reviewed */
  workOrderId: string;
  /** Identifier of the reviewer */
  reviewerId: string;
  /** Role of the reviewer */
  reviewerRole: WorkOrderReviewActorRole | string;
  /** Approval gates required by the Work Order, if any */
  requiredApprovalGates?: string[];
  /** ISO 8601 timestamp override (defaults to now) */
  createdAt?: string;
}

export type WorkOrderReviewIntentType =
  | WorkOrderReviewDecision
  | "blocked_execution_request"
  | "ambiguous";

export interface WorkOrderReviewInterpretation {
  /** The detected intent */
  intent: WorkOrderReviewIntentType;
  /** A structured review object when the intent maps to a valid decision */
  review?: Record<string, unknown>;
  /** Human-readable summary of the interpretation */
  summary: string;
  /** Validation issues, if any */
  issues: WorkOrderReviewIssue[];
  /** Always true — the human is on the loop */
  humanOnTheLoop: true;
  /** Always true — no execution is authorized */
  noExecutionAuthorized: true;
}

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

/**
 * Execution-related language that must be blocked.
 * These words indicate the user wants runtime dispatch, which is forbidden.
 */
const EXECUTION_KEYWORDS = [
  // French
  "exécute", "execute", "exécuter",
  "publie", "publier", "publication maintenant",
  "envoie", "envoyer",
  "déploie", "deploie", "déployer", "deployer",
  "lance maintenant", "lancer maintenant",
  "book le", "book un", "book la", "booker",
  "contacte", "contacter",
  "dépense", "depense", "dépenser",
  "paie", "payer", "pay",
  // English
  "publish", "send", "deploy", "spend",
  "go execute", "run now", "ship it", "push to prod",
] as const;

/**
 * Approval language — the user wants to approve the Work Order for planning.
 */
const APPROVAL_KEYWORDS = [
  // French
  "go", "approuve", "approuvé", "approuver",
  "ok pour planifier", "ok pour le plan",
  "vas-y", "vas-y pour le plan", "c'est bon",
  "validé", "valide", "d'accord",
  "oui", "parfait", "excellent",
  // English
  "approved", "looks good", "lgtm", "ship to plan",
  "approve", "good to go", "proceed",
] as const;

/**
 * Rejection language — the user wants to decline the Work Order.
 */
const REJECTION_KEYWORDS = [
  // French
  "refuse", "refuser", "refusé",
  "rejette", "rejeter", "rejeté",
  "non", "pas bon", "on abandonne",
  "annule", "annuler", "abandon",
  // English
  "reject", "rejected", "decline", "no", "cancel",
  "not good", "drop it", "kill it",
] as const;

/**
 * Request-for-changes language — the user wants modifications.
 */
const CHANGE_KEYWORDS = [
  // French
  "change", "changer", "modifie", "modifier",
  "ajuste", "ajuster", "réduis", "réduire",
  "retire", "retirer", "enlève", "enlever",
  "augmente", "augmenter",
  "ok mais", "oui mais",
  // English
  "modify", "adjust", "reduce", "remove",
  "change the", "update the", "increase",
  "ok but", "yes but",
] as const;

/**
 * Ask-for-more-info language — the user wants clarification.
 */
const INFO_KEYWORDS = [
  // French
  "plus d'info", "plus d'information",
  "explique", "expliquer",
  "quels sont", "quel est",
  "pourquoi", "comment",
  "combien", "donne-moi",
  "détaille", "détailler", "précise", "préciser",
  "c'est quoi",
  // English
  "more info", "explain", "why", "how",
  "what is", "tell me more", "clarify",
  "how much", "give me details",
] as const;

// ---------------------------------------------------------------------------
// Public: execution language detection
// ---------------------------------------------------------------------------

/**
 * Detects whether the message contains language requesting live execution,
 * runtime dispatch, or any forbidden operational action.
 *
 * Returns the matched keyword if found, or null if clean.
 * This function is pure — it does not mutate the input.
 */
export function detectForbiddenExecutionLanguage(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const keyword of EXECUTION_KEYWORDS) {
    if (text.includes(keyword)) {
      return keyword;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public: review intent detection
// ---------------------------------------------------------------------------

/**
 * Detects the review intent from the natural-language message.
 * Priority order:
 *   1. blocked_execution_request (safety-first)
 *   2. request_changes (conditional approval with modifications)
 *   3. reject
 *   4. ask_for_more_info
 *   5. approve_to_plan
 *   6. ambiguous (fallback)
 *
 * request_changes is checked before approve_to_plan because phrases like
 * "ok mais sans publier" contain approval keywords but are actually change
 * requests. Execution check is always first for safety.
 *
 * This function is pure — it does not mutate the input.
 */
export function detectReviewIntent(message: string): WorkOrderReviewIntentType {
  const text = message.toLowerCase().trim();

  // 1. Safety first: blocked execution language
  if (detectForbiddenExecutionLanguage(message) !== null) {
    return "blocked_execution_request";
  }

  // 2. Request changes (conditional approval with modifications)
  const hasChangeKeyword = CHANGE_KEYWORDS.some((kw) => text.includes(kw));
  if (hasChangeKeyword) {
    return "request_changes";
  }

  // 3. Rejection
  const hasRejectionKeyword = REJECTION_KEYWORDS.some((kw) => text.includes(kw));
  if (hasRejectionKeyword) {
    return "reject";
  }

  // 4. Ask for more info
  const hasInfoKeyword = INFO_KEYWORDS.some((kw) => text.includes(kw));
  if (hasInfoKeyword) {
    return "ask_for_more_info";
  }

  // 5. Approval (approve to plan, never execute)
  const hasApprovalKeyword = APPROVAL_KEYWORDS.some((kw) => text.includes(kw));
  if (hasApprovalKeyword) {
    return "approve_to_plan";
  }

  // 6. Fallback: ambiguous
  return "ambiguous";
}

// ---------------------------------------------------------------------------
// Public: extract requested changes from message
// ---------------------------------------------------------------------------

/**
 * Attempts to extract structured change requests from a natural-language
 * review message. This is a best-effort heuristic — full accuracy requires
 * AI assistance in a future PR.
 *
 * This function is pure — it does not mutate the input.
 */
export function extractRequestedChanges(message: string): WorkOrderRequestedChange[] {
  const changes: WorkOrderRequestedChange[] = [];

  const text = message.toLowerCase();

  // Budget-related changes
  if (text.includes("budget") || text.includes("coût") || text.includes("cout") || text.includes("prix")) {
    changes.push({
      field: "budgetRequested",
      description: message,
      severity: "required",
    });
  }

  // Publication-related changes
  if (text.includes("publi") || text.includes("publish")) {
    changes.push({
      field: "approvalGates",
      description: message,
      severity: "required",
    });
  }

  // Risk-related changes
  if (text.includes("risque") || text.includes("risk")) {
    changes.push({
      field: "riskLevel",
      description: message,
      severity: "required",
    });
  }

  // Objective / target changes
  if (text.includes("objectif") || text.includes("objective") || text.includes("cible") || text.includes("target")) {
    changes.push({
      field: "objective",
      description: message,
      severity: "required",
    });
  }

  // Next action changes
  if (text.includes("next action") || text.includes("prochaine action") || text.includes("next step")) {
    changes.push({
      field: "nextAction",
      description: message,
      severity: "suggested",
    });
  }

  // Generic fallback: if no specific field detected, use "general"
  if (changes.length === 0) {
    changes.push({
      field: "general",
      description: message,
      severity: "required",
    });
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Public: create blocked execution review result
// ---------------------------------------------------------------------------

/**
 * Creates a structured interpretation result for a blocked execution request.
 * This is used when the reviewer's message contains language requesting
 * live execution, which is always forbidden.
 *
 * This function is pure — it does not mutate the input.
 */
export function createBlockedExecutionReviewResult(
  input: WorkOrderReviewInput,
  matchedKeyword: string,
): WorkOrderReviewInterpretation {
  return {
    intent: "blocked_execution_request",
    summary: [
      `⛔ Exécution bloquée. Ta demande contient un mot-clé d'exécution directe (« ${matchedKeyword} »).`,
      `En tant que CEO / Workflow Owner, tu peux approuver pour planification, demander des modifications, rejeter, ou poser des questions.`,
      `Aucune exécution directe ne peut être autorisée via un Work Order Review.`,
      ``,
      `💡 *Human-on-the-Loop : Cette protection garantit que Joris ne peut jamais exécuter, publier, déployer, contacter ou dépenser sans un workflow de validation complet.*`,
    ].join("\n"),
    issues: [{
      code: "blocked_execution_request",
      message: `Execution keyword detected: "${matchedKeyword}". Reviews cannot authorize execution.`,
      severity: "error",
    }],
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

// ---------------------------------------------------------------------------
// Internal: build approval gate acknowledgements
// ---------------------------------------------------------------------------

function buildGateAcknowledgements(
  requiredGates: string[],
): WorkOrderApprovalGateAcknowledgement[] {
  return requiredGates.map((gate) => ({
    gate: gate as ApprovalGate,
    acknowledged: true,
    note: "Acknowledged via approval message",
  }));
}

// ---------------------------------------------------------------------------
// Public: main interpreter
// ---------------------------------------------------------------------------

/**
 * Interprets a natural-language Work Order review message and returns a
 * structured interpretation compatible with the Work Order Human Review
 * Contract (PR117).
 *
 * This function is pure — it does not mutate the input.
 * It never authorizes execution, and always sets humanOnTheLoop: true
 * and noExecutionAuthorized: true.
 */
export function interpretWorkOrderReviewMessage(
  input: WorkOrderReviewInput,
): WorkOrderReviewInterpretation {
  const issues: WorkOrderReviewIssue[] = [];

  // ---- Input validation ----

  if (!input.workOrderId) {
    issues.push({
      code: "missing_work_order_id",
      message: "Cannot create review without workOrderId",
      severity: "error",
    });
  }

  if (!input.reviewerId) {
    issues.push({
      code: "missing_reviewer",
      message: "Cannot create review without reviewerId",
      severity: "error",
    });
  }

  if (issues.length > 0) {
    return {
      intent: "ambiguous",
      summary: "Impossible de créer une revue : informations manquantes (workOrderId ou reviewerId).",
      issues,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  // ---- Execution language check (safety-first) ----

  const executionKeyword = detectForbiddenExecutionLanguage(input.message);
  if (executionKeyword !== null) {
    return createBlockedExecutionReviewResult(input, executionKeyword);
  }

  // ---- Intent detection ----

  const intent = detectReviewIntent(input.message);
  const reviewId = `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = input.createdAt || new Date().toISOString();

  // ---- Build review object based on intent ----

  if (intent === "approve_to_plan") {
    const review: Record<string, unknown> = {
      id: reviewId,
      workOrderId: input.workOrderId,
      decision: "approve_to_plan" as WorkOrderReviewDecision,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      createdAt,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      confidence: "high",
    };

    // Acknowledge required gates if provided
    if (input.requiredApprovalGates && input.requiredApprovalGates.length > 0) {
      review.approvalGateAcknowledgements = buildGateAcknowledgements(input.requiredApprovalGates);
    }

    return {
      intent: "approve_to_plan",
      review,
      summary: `✅ Approuvé pour planification. Le Work Order \`${input.workOrderId}\` avance en phase de planification. Aucune exécution autorisée.`,
      issues: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  if (intent === "request_changes") {
    const requestedChanges = extractRequestedChanges(input.message);

    const review: Record<string, unknown> = {
      id: reviewId,
      workOrderId: input.workOrderId,
      decision: "request_changes" as WorkOrderReviewDecision,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      createdAt,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      reason: input.message,
      requestedChanges,
    };

    return {
      intent: "request_changes",
      review,
      summary: `🔄 Modifications demandées sur le Work Order \`${input.workOrderId}\`. ${requestedChanges.length} changement(s) identifié(s). Aucune exécution autorisée.`,
      issues: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  if (intent === "reject") {
    const review: Record<string, unknown> = {
      id: reviewId,
      workOrderId: input.workOrderId,
      decision: "reject" as WorkOrderReviewDecision,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      createdAt,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      reason: input.message,
    };

    return {
      intent: "reject",
      review,
      summary: `❌ Work Order \`${input.workOrderId}\` rejeté. Raison : ${input.message}`,
      issues: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  if (intent === "ask_for_more_info") {
    const review: Record<string, unknown> = {
      id: reviewId,
      workOrderId: input.workOrderId,
      decision: "ask_for_more_info" as WorkOrderReviewDecision,
      reviewerId: input.reviewerId,
      reviewerRole: input.reviewerRole,
      createdAt,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      reason: input.message,
    };

    return {
      intent: "ask_for_more_info",
      review,
      summary: `❓ Informations supplémentaires demandées pour le Work Order \`${input.workOrderId}\`. Question : ${input.message}`,
      issues: [],
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
    };
  }

  // ---- Ambiguous fallback ----

  return {
    intent: "ambiguous",
    summary: `Je n'ai pas pu déterminer ta décision pour le Work Order \`${input.workOrderId}\`. Peux-tu préciser ? Options : approuver pour planification, demander des modifications, rejeter, ou poser des questions.`,
    issues: [{
      code: "ambiguous_intent",
      message: "Could not determine review intent from the message",
      severity: "warning",
    }],
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}
