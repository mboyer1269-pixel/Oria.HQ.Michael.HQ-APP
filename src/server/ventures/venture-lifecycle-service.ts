// src/server/ventures/venture-lifecycle-service.ts
//
// Controlled lifecycle management for SAVED ventures (PR150): edit details,
// archive (with reason), kill (with reason). This is the testable core; the
// owner gate lives in the "use server" action that wraps it
// (venture-lifecycle-action.ts).
//
// Safety invariants enforced here:
//   - Every operation is scoped strictly by workspaceId (no cross-workspace
//     read/write). The venture is fetched by workspaceId + ventureId first.
//   - Reads/writes go only through the PR148 repository. Nothing executes an
//     external action, mutates DB schema, or deletes a row.
//   - archive/kill require a non-empty reason and append a VentureDecision with
//     decidedBy "ceo", humanOnTheLoop true, noExecutionAuthorized true. Those
//     decisions authorize nothing — they are an audit trail.
//   - There is NO permanent-delete function. Delete is out of scope by design.
//   - Edit changes only a safe allow-list of fields; id/source/createdAt/status/
//     decisions/assignedAgents/autonomyProfile are never edited here.

import type { VentureCard, VentureDecision } from "@/features/ventures/types";
import type {
  VentureEditableFields,
  VentureLifecycleActionInput,
  VentureLifecycleOutcome,
  VenturePromotionInput,
  VentureUpdateInput,
} from "@/features/ventures/venture-lifecycle-types";
import {
  advancementDecisionType,
  isAdvancementTarget,
  VENTURE_STATUS_LABELS,
} from "@/features/ventures/venture-promotion";
import { getVentureById, getVenturePersistenceMode, updateVenture } from "./venture-repository";

const LOCKED_STATUSES: ReadonlySet<VentureCard["status"]> = new Set(["archived", "killed"]);

function nowIso(explicit?: string): string {
  return explicit ?? new Date().toISOString();
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function generateDecisionId(prefix: string): string {
  const hasRandomUuid =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function";
  return `${prefix}-${hasRandomUuid ? globalThis.crypto.randomUUID() : `${Date.now()}`}`;
}

async function persist(workspaceId: string, card: VentureCard): Promise<VentureLifecycleOutcome> {
  try {
    const saved = await updateVenture(workspaceId, card);
    return { status: "saved", card: saved, storageMode: getVenturePersistenceMode() };
  } catch {
    // Sanitized: never surface repository/driver internals.
    return { status: "error", code: "repository_error" };
  }
}

/**
 * Applies the safe editable allow-list to a card, returning the next card plus
 * whether anything actually changed. validationPlan basics are applied only when
 * the venture already has a plan (edit never fabricates a plan).
 */
function applyEditableFields(
  card: VentureCard,
  fields: VentureEditableFields,
): { next: VentureCard; changed: boolean } {
  const next: VentureCard = { ...card };
  let changed = false;

  const textFields: Array<[keyof VentureEditableFields, keyof VentureCard]> = [
    ["name", "name"],
    ["description", "description"],
    ["targetCustomer", "targetCustomer"],
    ["problem", "problem"],
    ["offer", "offer"],
    ["primaryChannel", "primaryChannel"],
  ];
  for (const [inKey, cardKey] of textFields) {
    const value = cleanText(fields[inKey]);
    if (value !== undefined && value !== card[cardKey]) {
      (next[cardKey] as string) = value;
      changed = true;
    }
  }

  // validationPlan basics — only when a plan already exists.
  if (card.validationPlan) {
    const plan = { ...card.validationPlan };
    let planChanged = false;

    const hypothesis = cleanText(fields.hypothesis);
    if (hypothesis !== undefined && hypothesis !== plan.hypothesis) {
      plan.hypothesis = hypothesis;
      planChanged = true;
    }
    if (
      fields.validationWindowDays !== undefined &&
      fields.validationWindowDays !== plan.windowDays
    ) {
      plan.windowDays = fields.validationWindowDays;
      planChanged = true;
    }
    if (
      typeof fields.budgetCapCents === "number" &&
      Number.isFinite(fields.budgetCapCents) &&
      Math.max(0, Math.trunc(fields.budgetCapCents)) !== plan.budgetCapCents
    ) {
      plan.budgetCapCents = Math.max(0, Math.trunc(fields.budgetCapCents));
      planChanged = true;
    }

    if (planChanged) {
      next.validationPlan = plan;
      changed = true;
    }
  }

  return { next, changed };
}

/**
 * Edits the safe fields of a saved venture. Returns not_found when the venture
 * does not exist in this workspace, not_editable when it is archived/killed, and
 * no_changes when nothing in the allow-list actually changed.
 */
export async function updateVentureDetails(
  workspaceId: string,
  input: VentureUpdateInput,
): Promise<VentureLifecycleOutcome> {
  const existing = await getVentureById(workspaceId, input.ventureId);
  if (!existing) return { status: "error", code: "not_found" };
  if (LOCKED_STATUSES.has(existing.status)) return { status: "error", code: "not_editable" };

  const { next, changed } = applyEditableFields(existing, input.fields);
  if (!changed) return { status: "error", code: "no_changes" };

  next.updatedAt = nowIso(input.now);
  return persist(workspaceId, next);
}

/**
 * Records a terminal lifecycle decision (archive/kill) on a saved venture: sets
 * the status, appends an audit-only VentureDecision with the reason, and
 * persists. Requires a non-empty reason.
 */
async function recordTerminalDecision(
  workspaceId: string,
  input: VentureLifecycleActionInput,
  kind: "archive" | "kill",
  nextStatus: "archived" | "killed",
): Promise<VentureLifecycleOutcome> {
  const reason = cleanText(input.reason);
  if (!reason) return { status: "error", code: "invalid_reason" };

  const existing = await getVentureById(workspaceId, input.ventureId);
  if (!existing) return { status: "error", code: "not_found" };

  const decidedAt = nowIso(input.now);
  const decision: VentureDecision = {
    id: generateDecisionId(`decision-${kind}`),
    type: kind,
    summary: reason,
    decidedBy: "ceo",
    decidedAt,
    // Audit-only: authorizes no execution, always on the loop.
    noExecutionAuthorized: true,
    humanOnTheLoop: true,
  };

  const next: VentureCard = {
    ...existing,
    status: nextStatus,
    decisions: [...existing.decisions, decision],
    updatedAt: decidedAt,
  };

  return persist(workspaceId, next);
}

/** Archives a saved venture with a reason (hidden from active attention, history kept). */
export async function archiveVenture(
  workspaceId: string,
  input: VentureLifecycleActionInput,
): Promise<VentureLifecycleOutcome> {
  return recordTerminalDecision(workspaceId, input, "archive", "archived");
}

/** Kills a saved venture with a reason (business decision, history kept). */
export async function killVenture(
  workspaceId: string,
  input: VentureLifecycleActionInput,
): Promise<VentureLifecycleOutcome> {
  return recordTerminalDecision(workspaceId, input, "kill", "killed");
}

/**
 * Advances a saved venture forward one legal step (CEO-controlled). The target
 * is validated against the lifecycle advancement guard — an illegal jump (or a
 * terminal venture) returns `illegal_transition` and nothing is mutated. Records
 * an audit-only VentureDecision (`promote`/`scale`/`increase_autonomy`) with an
 * optional note, sets the new status, and persists. Authorizes no execution.
 */
export async function promoteVenture(
  workspaceId: string,
  input: VenturePromotionInput,
): Promise<VentureLifecycleOutcome> {
  const existing = await getVentureById(workspaceId, input.ventureId);
  if (!existing) return { status: "error", code: "not_found" };

  if (!isAdvancementTarget(existing.status, input.targetStatus)) {
    return { status: "error", code: "illegal_transition" };
  }

  const decidedAt = nowIso(input.now);
  const note = cleanText(input.note);
  const fromLabel = VENTURE_STATUS_LABELS[existing.status];
  const toLabel = VENTURE_STATUS_LABELS[input.targetStatus];

  const decision: VentureDecision = {
    id: generateDecisionId("decision-promote"),
    type: advancementDecisionType(input.targetStatus),
    summary: note ?? `Avancement ${fromLabel} → ${toLabel}.`,
    decidedBy: "ceo",
    decidedAt,
    // Audit-only: a promotion records a CEO decision, it executes nothing.
    noExecutionAuthorized: true,
    humanOnTheLoop: true,
  };

  const next: VentureCard = {
    ...existing,
    status: input.targetStatus,
    decisions: [...existing.decisions, decision],
    updatedAt: decidedAt,
  };

  return persist(workspaceId, next);
}
