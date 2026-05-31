import type { VentureLifecycleStatus } from "./types";

const DEFAULT_VISIBLE_CANDIDATE_LIMIT = 6;
const DEFAULT_ACTIVE_VALIDATION_SLOT_LIMIT = 3;

const ACTIVE_STATUSES: ReadonlySet<VentureLifecycleStatus> = new Set([
  "approved_for_validation",
  "validating",
  "operating",
  "autonomous",
  "scaling",
]);

const TERMINAL_STATUSES: ReadonlySet<VentureLifecycleStatus> = new Set(["archived"]);

const DIRECT_PROMOTIONS: ReadonlyMap<VentureLifecycleStatus, readonly VentureLifecycleStatus[]> = new Map([
  ["discovered", ["candidate"]],
  ["candidate", ["scored"]],
  ["scored", ["shortlisted"]],
  ["shortlisted", ["approved_for_validation"]],
  ["approved_for_validation", ["validating"]],
  ["validating", ["operating"]],
  ["operating", ["autonomous", "scaling"]],
  ["autonomous", ["scaling"]],
  ["paused", ["validating", "operating"]],
  ["killed", ["archived"]],
]);

export function isActiveVentureStatus(status: VentureLifecycleStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isTerminalVentureStatus(status: VentureLifecycleStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canPromoteVenture(
  status: VentureLifecycleStatus,
  targetStatus: VentureLifecycleStatus,
): boolean {
  if (isTerminalVentureStatus(status)) return false;

  const directTargets = DIRECT_PROMOTIONS.get(status) ?? [];
  if (directTargets.includes(targetStatus)) return true;

  if (targetStatus === "paused") {
    return status !== "paused" && status !== "killed";
  }

  if (targetStatus === "killed") {
    return status !== "killed";
  }

  return false;
}

export function getDefaultVisibleCandidateLimit(): number {
  return DEFAULT_VISIBLE_CANDIDATE_LIMIT;
}

export function getDefaultActiveValidationSlotLimit(): number {
  return DEFAULT_ACTIVE_VALIDATION_SLOT_LIMIT;
}
