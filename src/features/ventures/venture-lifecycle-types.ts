// src/features/ventures/venture-lifecycle-types.ts
//
// Shared, dependency-free types for controlled venture lifecycle management
// (PR150): edit details, archive (with reason), kill (with reason). Imported by
// both the server service/action and the client UI, so this module has NO
// "use server"/"use client" directive and no server-only imports.
//
// Scope note: there is intentionally NO permanent-delete type here. Delete is
// irreversible and deferred to a separate policy. Archive hides from active
// attention while preserving history; kill is a business decision with a reason.

import type { VentureCard, VentureLifecycleStatus } from "./types";
import type { VenturePersistenceMode } from "./venture-save-types";

export type VentureActionStatus = "saved" | "error";

/**
 * The only fields a CEO may edit directly. id, source, status, createdAt,
 * decisions, assignedAgents, and the autonomy profile are intentionally absent —
 * status changes only flow through archive/kill; the rest are immutable here.
 * The validationPlan basics are applied only when the venture already has a plan.
 */
export type VentureEditableFields = {
  name?: string;
  description?: string;
  targetCustomer?: string;
  problem?: string;
  offer?: string;
  primaryChannel?: string;
  hypothesis?: string;
  validationWindowDays?: 7 | 30 | 60 | 90;
  budgetCapCents?: number;
};

export type VentureUpdateInput = {
  ventureId: string;
  fields: VentureEditableFields;
  /** Optional explicit ISO timestamp (deterministic tests). */
  now?: string;
};

export type VentureLifecycleActionInput = {
  ventureId: string;
  reason: string;
  /** Optional explicit ISO timestamp (deterministic tests). */
  now?: string;
};

/**
 * Advance a saved venture forward one legal step. `note` is optional context for
 * the audit decision (promotion does not require a reason the way kill/archive
 * do). The target must be a legal advancement for the venture's current status.
 */
export type VenturePromotionInput = {
  ventureId: string;
  targetStatus: VentureLifecycleStatus;
  note?: string;
  /** Optional explicit ISO timestamp (deterministic tests). */
  now?: string;
};

export type VentureLifecycleErrorCode =
  | "not_found"
  | "invalid_reason"
  | "no_changes"
  | "not_editable"
  | "illegal_transition"
  | "repository_error";

/** Service-level outcome: a persisted card, or a sanitized error code. */
export type VentureLifecycleOutcome =
  | { status: "saved"; card: VentureCard; storageMode: VenturePersistenceMode }
  | { status: "error"; code: VentureLifecycleErrorCode };

/** Action-level result: the outcome plus the owner-gate refusal case. */
export type VentureLifecycleActionResult =
  | VentureLifecycleOutcome
  | { status: "forbidden" };
