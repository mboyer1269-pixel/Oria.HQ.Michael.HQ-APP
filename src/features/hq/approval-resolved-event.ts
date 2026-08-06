/**
 * Shared browser events for CEO approval outcomes that should resume into chat.
 * Keep payloads small and non-secret — summaries only.
 */

export const APPROVAL_RESOLVED_EVENT = "michael-hq:approval-resolved";

export type ApprovalResolvedDetail = {
  source: "mission-draft" | "hermes-intent";
  decision: "approved" | "rejected" | "cancelled";
  summary: string;
  href?: string;
};

export function dispatchApprovalResolved(detail: ApprovalResolvedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APPROVAL_RESOLVED_EVENT, { detail }));
}
