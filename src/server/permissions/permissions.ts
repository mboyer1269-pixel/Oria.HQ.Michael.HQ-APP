// Permission / capability model — two ORTHOGONAL axes, deliberately kept
// separate (do NOT merge them into one list):
//
//   1. Action autonomy (THIS module): `permissionRules` (src/features/hq/seed.ts,
//      typed PermissionRule[] canonical in src/core/types.ts). checkPermission()
//      answers "what autonomy level does this ACTION need, and does it require
//      confirmation?" — keyed by action id, e.g. "calendar-simple".
//   2. Assistant tool gating: `AssistantProfile.allowedTools` (from the workspace
//      config, src/config/workspaces/*.config.ts). Answers "is THIS assistant
//      allowed to invoke this tool/skill?" — keyed by skill id, e.g. "calendar.book".
//
// A third axis (effectful skills must be ledgered) lives in
// src/server/actions/ledger-events.ts. The action id ("calendar-simple") and the
// skill/tool id ("calendar.book") are intentionally different namespaces.
// These ids are locked against drift by src/core/workspaces/source-of-truth.test.mjs.
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
