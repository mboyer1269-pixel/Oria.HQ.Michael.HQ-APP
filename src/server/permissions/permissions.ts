import type { AutonomyLevel } from "@/core/types";
import { permissionRules } from "@/features/hq/seed";

export type PermissionCheck = {
  allowed: boolean;
  requiresConfirmation: boolean;
  autonomyLevel: AutonomyLevel;
  reason: string;
};

export function checkPermission(actionId: string): PermissionCheck {
  const rule = permissionRules.find((item) => item.id === actionId);

  if (!rule) {
    return {
      allowed: false,
      requiresConfirmation: true,
      autonomyLevel: 0,
      reason: "Action inconnue: confirmation obligatoire.",
    };
  }

  return {
    allowed: true,
    requiresConfirmation: rule.requiresConfirmation,
    autonomyLevel: rule.level,
    reason: rule.reason,
  };
}
