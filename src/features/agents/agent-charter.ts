import type { AgentProfile } from "./types";

// ---------------------------------------------------------------------------
// Agent Charter — the operational DNA layer above the registry.
//
// The registry (`seed.ts`) says WHO an agent is (id, role, skills, hard
// constraints). The charter says WHY it exists and HOW it earns its place:
// mission, decision logic, workflows with triggers and outputs, measurable
// success criteria and the ROI lever it pulls.
//
// Design principles (grounded in current multi-agent orchestration practice):
//   - Hub-and-spoke: Joris is the single orchestrator; module agents never
//     talk to each other directly. One accountability point.
//   - Every workflow declares trigger → business reason → output →
//     validation → next action. A workflow that triggers nothing is dead
//     weight and the health report flags it.
//   - Charters are pure data + pure functions. No I/O, no Date.now().
//   - Charters never weaken registry constraints — they reference them.
// ---------------------------------------------------------------------------

/** ROI lever an agent pulls. Primary lever first in the charter array. */
export type RoiLever =
  | "revenue"
  | "cost_saving"
  | "time_saving"
  | "risk_reduction"
  | "decision_quality";

export type AgentWorkflowDef = {
  /** Globally unique kebab-case id, e.g. "radar-weekly-market-scan". */
  id: string;
  title: string;
  /** What starts this workflow (CEO command, cadence, upstream event). */
  trigger: string;
  /** Why this workflow exists in business terms ($, time, decision, risk). */
  businessReason: string;
  inputs: string[];
  /** The useful output — a decision, action, draft, synthesis or measure. */
  outputs: string[];
  /** How the output is checked before it counts. */
  validation: string;
  /** What happens next when the output is validated. */
  nextAction: string;
  /** Skills consumed — must be a subset of the agent's registry skillIds. */
  skillIds: string[];
};

export type AgentKpi = {
  id: string;
  label: string;
  /** Human-readable target, e.g. "≥ 80%" or "< 24h". */
  target: string;
};

export type AgentCharter = {
  /** Must resolve to a canonical registry agent id. */
  agentId: string;
  /** One-sentence outcome the agent is accountable for. */
  mission: string;
  dna: {
    /** One line of identity — how the agent thinks about itself. */
    identity: string;
    /** Decision logic — how the agent reasons when acting. */
    operatingPrinciples: string[];
    /** Ordered conflict-resolution rules: what wins when goals collide. */
    prioritization: string[];
  };
  /** ROI levers, primary first. */
  roiLevers: RoiLever[];
  workflows: AgentWorkflowDef[];
  /** Measurable statements — when these hold, the agent is succeeding. */
  successCriteria: string[];
  kpis: AgentKpi[];
  /** When the agent must stop and hand back to Joris / CEO. */
  escalation: string;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type CharterIssue = {
  agentId: string;
  severity: "error" | "warning";
  message: string;
};

export type CharterValidationReport = {
  valid: boolean;
  issues: CharterIssue[];
  /** Registry agents without a charter. */
  missingCharters: string[];
  /** Charters pointing at unknown agents. */
  orphanCharters: string[];
};

/**
 * Validates the charter set against the agent registry.
 *
 * Errors: missing/orphan/duplicate charters, workflow skillIds not granted
 * to the agent, duplicate workflow ids, empty mission.
 * Warnings: no KPI, no workflow, fewer than 2 operating principles.
 */
export function validateAgentCharters(
  agents: AgentProfile[],
  charters: AgentCharter[],
): CharterValidationReport {
  const issues: CharterIssue[] = [];
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const charterAgentIds = new Set<string>();
  const workflowIds = new Set<string>();

  for (const charter of charters) {
    if (charterAgentIds.has(charter.agentId)) {
      issues.push({
        agentId: charter.agentId,
        severity: "error",
        message: "Duplicate charter for agent",
      });
      continue;
    }
    charterAgentIds.add(charter.agentId);

    const agent = agentById.get(charter.agentId);
    if (!agent) continue; // counted as orphan below

    if (!charter.mission.trim()) {
      issues.push({ agentId: charter.agentId, severity: "error", message: "Empty mission" });
    }
    if (charter.dna.operatingPrinciples.length < 2) {
      issues.push({
        agentId: charter.agentId,
        severity: "warning",
        message: "Fewer than 2 operating principles — DNA too thin to guide decisions",
      });
    }
    if (charter.workflows.length === 0) {
      issues.push({
        agentId: charter.agentId,
        severity: "warning",
        message: "No workflow — agent is decorative until one exists",
      });
    }
    if (charter.kpis.length === 0) {
      issues.push({
        agentId: charter.agentId,
        severity: "warning",
        message: "No KPI — contribution cannot be measured",
      });
    }
    if (charter.roiLevers.length === 0) {
      issues.push({
        agentId: charter.agentId,
        severity: "error",
        message: "No ROI lever declared",
      });
    }

    const granted = new Set(agent.skillIds);
    for (const wf of charter.workflows) {
      if (workflowIds.has(wf.id)) {
        issues.push({
          agentId: charter.agentId,
          severity: "error",
          message: `Duplicate workflow id: ${wf.id}`,
        });
      }
      workflowIds.add(wf.id);

      for (const skillId of wf.skillIds) {
        if (!granted.has(skillId)) {
          issues.push({
            agentId: charter.agentId,
            severity: "error",
            message: `Workflow ${wf.id} uses skill "${skillId}" not granted in the registry`,
          });
        }
      }
      if (!wf.trigger.trim() || !wf.nextAction.trim()) {
        issues.push({
          agentId: charter.agentId,
          severity: "error",
          message: `Workflow ${wf.id} must declare a trigger and a next action`,
        });
      }
    }
  }

  const missingCharters = agents
    .filter((a) => !charterAgentIds.has(a.id))
    .map((a) => a.id);
  const orphanCharters = charters
    .map((c) => c.agentId)
    .filter((id) => !agentById.has(id));

  for (const id of missingCharters) {
    issues.push({ agentId: id, severity: "error", message: "Registry agent has no charter" });
  }
  for (const id of orphanCharters) {
    issues.push({ agentId: id, severity: "error", message: "Charter references unknown agent" });
  }

  const valid = issues.every((i) => i.severity !== "error");
  return { valid, issues, missingCharters, orphanCharters };
}

// ---------------------------------------------------------------------------
// Charter health — the CEO/Operator gaze
// ---------------------------------------------------------------------------

export type CharterVerdict =
  | "operational" // complete DNA, ready to be held accountable
  | "thin"        // exists but missing measurable substance
  | "decorative"; // would not survive the "does this help Michael?" question

export type CharterHealthRow = {
  agentId: string;
  agentName: string;
  status: AgentProfile["status"];
  /** 0-100 completeness score across DNA, workflows, KPIs, ROI clarity. */
  score: number;
  verdict: CharterVerdict;
  primaryRoiLever: RoiLever | null;
  workflowCount: number;
  kpiCount: number;
  /** First actionable gap to fix, when one exists. */
  topGap: string | null;
};

export type CharterHealthReport = {
  rows: CharterHealthRow[];
  averageScore: number;
  operationalCount: number;
  thinCount: number;
  decorativeCount: number;
};

const SCORE_WEIGHTS = {
  mission: 15,
  principles: 15,
  prioritization: 10,
  workflows: 25,
  successCriteria: 10,
  kpis: 15,
  roi: 10,
} as const;

function scoreCharter(charter: AgentCharter): { score: number; topGap: string | null } {
  let score = 0;
  const gaps: string[] = [];

  if (charter.mission.trim()) score += SCORE_WEIGHTS.mission;
  else gaps.push("Écrire la mission");

  if (charter.dna.operatingPrinciples.length >= 2) score += SCORE_WEIGHTS.principles;
  else gaps.push("Ajouter des principes de décision");

  if (charter.dna.prioritization.length >= 1) score += SCORE_WEIGHTS.prioritization;
  else gaps.push("Définir la logique de priorisation");

  if (charter.workflows.length >= 1) {
    const complete = charter.workflows.every(
      (w) =>
        w.trigger.trim() &&
        w.businessReason.trim() &&
        w.outputs.length > 0 &&
        w.validation.trim() &&
        w.nextAction.trim(),
    );
    score += complete ? SCORE_WEIGHTS.workflows : Math.round(SCORE_WEIGHTS.workflows / 2);
    if (!complete) gaps.push("Compléter trigger/validation/next action des workflows");
  } else {
    gaps.push("Définir au moins un workflow");
  }

  if (charter.successCriteria.length >= 1) score += SCORE_WEIGHTS.successCriteria;
  else gaps.push("Définir les critères de succès");

  if (charter.kpis.length >= 1) score += SCORE_WEIGHTS.kpis;
  else gaps.push("Définir au moins un KPI");

  if (charter.roiLevers.length >= 1) score += SCORE_WEIGHTS.roi;
  else gaps.push("Déclarer le levier ROI");

  return { score, topGap: gaps[0] ?? null };
}

function verdictFor(score: number): CharterVerdict {
  if (score >= 85) return "operational";
  if (score >= 50) return "thin";
  return "decorative";
}

/**
 * Builds the supervision view: one row per registry agent, scored on charter
 * completeness. Agents without a charter score 0 (decorative) — visible, not
 * hidden. Deterministic: rows follow registry order.
 */
export function buildCharterHealthReport(
  agents: AgentProfile[],
  charters: AgentCharter[],
): CharterHealthReport {
  const charterByAgent = new Map(charters.map((c) => [c.agentId, c]));

  const rows: CharterHealthRow[] = agents.map((agent) => {
    const charter = charterByAgent.get(agent.id);
    if (!charter) {
      return {
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        score: 0,
        verdict: "decorative",
        primaryRoiLever: null,
        workflowCount: 0,
        kpiCount: 0,
        topGap: "Créer la charte",
      };
    }
    const { score, topGap } = scoreCharter(charter);
    return {
      agentId: agent.id,
      agentName: agent.name,
      status: agent.status,
      score,
      verdict: verdictFor(score),
      primaryRoiLever: charter.roiLevers[0] ?? null,
      workflowCount: charter.workflows.length,
      kpiCount: charter.kpis.length,
      topGap,
    };
  });

  const averageScore = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + r.score, 0) / rows.length)
    : 0;

  return {
    rows,
    averageScore,
    operationalCount: rows.filter((r) => r.verdict === "operational").length,
    thinCount: rows.filter((r) => r.verdict === "thin").length,
    decorativeCount: rows.filter((r) => r.verdict === "decorative").length,
  };
}

/** Lookup helper — single charter for an agent id, or null. */
export function getAgentCharter(
  charters: AgentCharter[],
  agentId: string,
): AgentCharter | null {
  return charters.find((c) => c.agentId === agentId) ?? null;
}
