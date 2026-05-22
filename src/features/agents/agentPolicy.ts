import type { CharterRule, CharterRuleMode } from "@/features/hq/types";
import { getCharter } from "./charters";

export function getRule(agentId: string, action: string): CharterRule | undefined {
  return getCharter(agentId)?.rules.find((r) => r.action === action);
}

export function getRuleMode(agentId: string, action: string): CharterRuleMode | undefined {
  return getRule(agentId, action)?.mode;
}

export function canAutoRun(agentId: string, action: string): boolean {
  return getRuleMode(agentId, action) === "auto";
}

export function requiresApproval(agentId: string, action: string): boolean {
  return getRuleMode(agentId, action) === "approval_required";
}

export function isForbidden(agentId: string, action: string): boolean {
  return getRuleMode(agentId, action) === "forbidden";
}

export function isSupervised(agentId: string, action: string): boolean {
  return getRuleMode(agentId, action) === "supervised";
}
