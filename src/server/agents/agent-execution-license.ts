/**
 * AgentExecutionLicense -- PR2 Bounded Live Execution Layer
 *
 * Defines the operational envelope for each agent: which tools they can use,
 * which actions they can take live, their spending caps, and which audience
 * size / visibility they are allowed to reach.
 *
 * The license is the authoritative source for Sentinelle's policy engine
 * (PR3). It is distinct from the AgentProfile: the profile describes WHO the
 * agent is; the license describes WHAT it is permitted to DO.
 *
 * Safety invariants:
 *   - Sentinel always gates GREEN zone actions (observe + log).
 *   - YELLOW zone always requires human approval before dispatch.
 *   - RED zone actions are blocked unconditionally.
 *   - No license may grant level-5 actions (financial / irreversible external).
 */

import type { ExecutionZone } from "../../core/types.ts";

export type AllowedVisibility = "internal" | "unlisted" | "public";

export type AgentExecutionLicense = {
  agentId: string;
  /** Human-readable label shown in the CEO review UI. */
  label: string;
  /** Default execution zone for unclassified actions. */
  defaultZone: ExecutionZone;
  /** Tool IDs this agent is allowed to invoke. */
  allowedTools: string[];
  /**
   * Action IDs explicitly allowed without per-action approval (green zone).
   * Actions not listed here fall back to defaultZone.
   */
  greenActions: string[];
  /**
   * Action IDs that always require human approval before dispatch (yellow).
   * Takes precedence over greenActions.
   */
  yellowActions: string[];
  /** Maximum spend per action in CAD cents (0 = no spend allowed). */
  maxSpendPerActionCents: number;
  /** Maximum audience size for outbound actions (0 = internal only). */
  maxAudienceSize: number;
  /** Publication visibility levels this agent may reach. */
  allowedVisibility: AllowedVisibility[];
  /** Sentinel supervision required (should always be true for non-red). */
  requiresSentinel: boolean;
  /** Ledger entry required for every live action (should always be true). */
  requiresLedger: boolean;
  /** Revokes this licence immediately without removing registry history. */
  suspended?: boolean;
  /** Actions this agent can never perform, regardless of zone. */
  hardBlocks: string[];
};

// ---------------------------------------------------------------------------
// License Registry -- one entry per agent
// ---------------------------------------------------------------------------

export const agentLicenseRegistry: AgentExecutionLicense[] = [
  // ── Joris -- Director / Mission Router ──────────────────────────────────
  {
    agentId: "joris",
    label: "Joris -- Director",
    defaultZone: "green",
    allowedTools: ["calendar.book", "brief.generate", "mission.plan", "board.consult"],
    greenActions: [
      "mission.draft.create",
      "calendar.event.create",
      "brief.generate",
      "governance.preview",
    ],
    yellowActions: [
      "mission.confirm",
    ],
    maxSpendPerActionCents: 0,
    maxAudienceSize: 0,
    allowedVisibility: ["internal"],
    requiresSentinel: true,
    requiresLedger: true,
    hardBlocks: [
      "billing.modify",
      "credentials.access",
      "deploy.production",
      "email.send.external",
    ],
  },

  // ── Relay -- Operator ─────────────────────────────────────────────────────
  {
    agentId: "hermes",
    label: "Relay -- Operator",
    defaultZone: "yellow",
    allowedTools: ["sop.draft", "workflow.map"],
    greenActions: [
      "task.create",
      "task.assign.internal",
      "status.update.internal",
      "sop.draft.create",
    ],
    yellowActions: [
      "workflow.activate",
      "client.communication.draft",
    ],
    maxSpendPerActionCents: 0,
    maxAudienceSize: 0,
    allowedVisibility: ["internal"],
    requiresSentinel: true,
    requiresLedger: true,
    hardBlocks: [
      "credentials.access",
      "billing.modify",
      "deploy.production",
    ],
  },

  // ── Studio -- Content & Campaigns ─────────────────────────────────────────
  {
    agentId: "marketing",
    label: "Studio -- Content & Campaigns",
    defaultZone: "yellow",
    allowedTools: [
      "content.generate",
      "campaign.draft",
      "social.post.schedule",
      "email.draft",
      "brief.content",
    ],
    greenActions: [
      "content.generate",
      "campaign.draft.create",
      "social.post.internal.schedule",
      "email.draft.internal",
      "brief.content.create",
    ],
    yellowActions: [
      "social.post.public.publish",
      "campaign.email.send",
      "landing.page.publish",
      "ad.campaign.launch",
    ],
    maxSpendPerActionCents: 0,    // No ad spend without explicit approval
    maxAudienceSize: 0,           // Internal only in green zone
    allowedVisibility: ["internal", "unlisted"],
    requiresSentinel: true,
    requiresLedger: true,
    hardBlocks: [
      "billing.modify",
      "credentials.access",
      "ad.budget.increase",
      "legal.claim.publish",
      "deploy.production",
    ],
  },

  // ── Lab -- Opportunity & MVP Design ───────────────────────────────────────
  {
    agentId: "inventor",
    label: "Lab -- Opportunity & MVP Design",
    defaultZone: "green",
    allowedTools: [
      "opportunity.score",
      "mvp.design",
      "concept.generate",
      "market.signal.read",
      "spec.draft",
    ],
    greenActions: [
      "opportunity.score",
      "concept.generate",
      "mvp.design.draft",
      "spec.draft.create",
      "market.signal.read",
      "venture.suggest",
    ],
    yellowActions: [
      "offer.publish.public",
      "partner.outreach.send",
      "mvp.launch.external",
    ],
    maxSpendPerActionCents: 0,
    maxAudienceSize: 0,
    allowedVisibility: ["internal"],
    requiresSentinel: true,
    requiresLedger: true,
    hardBlocks: [
      "financial.commitment",
      "legal.contract.sign",
      "billing.modify",
      "deploy.production",
      "promise.non-validated.publish",
    ],
  },

  // ── Sentinel -- Policy Engine / Auditor ─────────────────────────────────
  {
    agentId: "sentinel",
    label: "Sentinel -- Policy Engine",
    defaultZone: "green",
    allowedTools: ["risk.review", "redteam.pass"],
    greenActions: [
      "risk.review",
      "policy.check",
      "action.block",
      "action.escalate",
    ],
    yellowActions: [],
    maxSpendPerActionCents: 0,
    maxAudienceSize: 0,
    allowedVisibility: ["internal"],
    requiresSentinel: false,  // Sentinel is the supervisor -- not supervised by itself
    requiresLedger: true,
    hardBlocks: [
      "sentinel.bypass",
      "policy.override",
      "billing.modify",
      "deploy.production",
    ],
  },
];

/**
 * Look up a license by agentId. Returns undefined if not registered.
 * Call sites should treat undefined as RED zone / blocked.
 */
export function getAgentLicense(agentId: string): AgentExecutionLicense | undefined {
  return agentLicenseRegistry.find((l) => l.agentId === agentId);
}

/**
 * Returns true if the given action is explicitly in the agent's green zone.
 * Falls back to false (requires approval or blocked) when the agent has no license.
 */
export function isGreenAction(agentId: string, actionId: string): boolean {
  const license = getAgentLicense(agentId);
  if (!license) return false;
  if (license.hardBlocks.includes(actionId)) return false;
  return license.greenActions.includes(actionId);
}

/**
 * Returns true if the action is in yellow zone (approval required).
 */
export function isYellowAction(agentId: string, actionId: string): boolean {
  const license = getAgentLicense(agentId);
  if (!license) return false;
  if (license.hardBlocks.includes(actionId)) return false;
  return license.yellowActions.includes(actionId);
}

/**
 * Returns true if the action is hard-blocked for this agent.
 */
export function isHardBlocked(agentId: string, actionId: string): boolean {
  const license = getAgentLicense(agentId);
  if (!license) return true;  // Unknown agent -> blocked
  return license.hardBlocks.includes(actionId);
}
