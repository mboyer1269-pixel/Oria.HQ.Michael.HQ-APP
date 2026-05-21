import type { Mission } from "@/core/types";

export type MissionApprovalSeverity = "none" | "low" | "medium" | "high";

export type MissionApprovalReason =
  | "explicit_flag"
  | "high_risk_level"
  | "high_autonomy"
  | "status_needs_approval";

export type MissionApprovalEvaluation = {
  missionId: string;
  required: boolean;
  severity: MissionApprovalSeverity;
  reasons: MissionApprovalReason[];
  reasonLabels: string[];
  blocksExecution: boolean;
};

function resolveSeverity(reasons: MissionApprovalReason[]): MissionApprovalSeverity {
  if (reasons.length === 0) return "none";
  if (reasons.includes("high_risk_level") || reasons.includes("high_autonomy")) return "high";
  if (reasons.includes("status_needs_approval")) return "medium";
  return "low";
}

export function evaluateMissionApproval(mission: Mission): MissionApprovalEvaluation {
  const reasons: MissionApprovalReason[] = [];

  if (mission.requiresApproval) reasons.push("explicit_flag");
  if (mission.riskLevel === "high") reasons.push("high_risk_level");
  if (mission.autonomyLevel >= 4) reasons.push("high_autonomy");
  if (mission.status === "needs_approval") reasons.push("status_needs_approval");

  const required = reasons.length > 0;
  const severity = resolveSeverity(reasons);

  const REASON_LABELS: Record<MissionApprovalReason, string> = {
    explicit_flag: "approbation explicitement requise",
    high_risk_level: "niveau de risque élevé",
    high_autonomy: `autonomie ${mission.autonomyLevel}/5 — action externe ou irréversible potentielle`,
    status_needs_approval: "mission en attente d'approbation",
  };

  const reasonLabels = reasons.map((r) => REASON_LABELS[r]);

  return {
    missionId: mission.id,
    required,
    severity,
    reasons,
    reasonLabels,
    blocksExecution: required,
  };
}
