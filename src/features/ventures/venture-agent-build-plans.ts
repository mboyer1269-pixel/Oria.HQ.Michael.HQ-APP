import { isTerminalVentureStatus } from "./lifecycle";
import type { VentureAutonomyDomain, VentureCard, VentureLifecycleStatus } from "./types";

export type VentureAgentBuildPlan = {
  id: string;
  ventureId: string;
  ventureName: string;
  recommended: boolean;
  recommendationReason: string;
  expectedProfitabilityLift: "low" | "medium" | "high";
  proposedAgentRole: string;
  skillsToBuild: string[];
  knowledgeToLoad: string[];
  autonomyDomains: VentureAutonomyDomain[];
  blockedCapabilities: VentureAutonomyDomain[];
  buildMode: "blueprint_only";
  humanOnTheLoop: true;
  noExecutionAuthorized: true;
};

export type VentureAgentBuildPlanSummary = {
  totalCount: number;
  recommendedCount: number;
  highLiftCount: number;
  plans: VentureAgentBuildPlan[];
  nextRecommendedPlan: VentureAgentBuildPlan | null;
};

const SAFE_AGENT_DOMAINS: VentureAutonomyDomain[] = [
  "research",
  "marketScanning",
  "analysis",
  "scoring",
  "reporting",
  "planning",
  "contentDrafting",
];

const BLOCKED_AGENT_CAPABILITIES: VentureAutonomyDomain[] = [
  "externalComms",
  "spending",
  "publishing",
  "dataMutation",
  "legalCommitment",
];

const AGENT_BUILD_LOCKED_STATUSES: ReadonlySet<VentureLifecycleStatus> = new Set([
  "archived",
  "killed",
]);

function isAgentBuildLocked(card: VentureCard): boolean {
  return isTerminalVentureStatus(card.status) || AGENT_BUILD_LOCKED_STATUSES.has(card.status);
}

function scoreSignals(card: VentureCard): {
  overallScore: number;
  automationPotential: number;
  ownerInvolvementRequired: number;
  strategicFit: number;
} {
  return {
    overallScore: card.score?.overallScore ?? 0,
    automationPotential: card.score?.automationPotential ?? 0,
    ownerInvolvementRequired: card.score?.ownerInvolvementRequired ?? 0,
    strategicFit: card.score?.strategicFit ?? 0,
  };
}

export function shouldRecommendAgentBuild(card: VentureCard): boolean {
  if (isAgentBuildLocked(card)) return false;

  const signals = scoreSignals(card);
  if (card.score?.recommendation === "go" || card.score?.recommendation === "test_small") {
    return signals.automationPotential >= 5 || signals.ownerInvolvementRequired >= 4;
  }

  if (card.status === "validating" || card.status === "operating") {
    return true;
  }

  return signals.automationPotential >= 7 && signals.strategicFit >= 6;
}

function expectedLift(card: VentureCard, recommended: boolean): VentureAgentBuildPlan["expectedProfitabilityLift"] {
  if (!recommended) return "low";
  const signals = scoreSignals(card);
  if (signals.overallScore >= 70 && signals.automationPotential >= 7) return "high";
  if (signals.automationPotential >= 6 || signals.ownerInvolvementRequired >= 6) return "medium";
  return "low";
}

function skillsForCard(card: VentureCard): string[] {
  const skills = [
    "market research synthesis",
    "customer-problem analysis",
    "offer packaging",
    "validation experiment design",
    "weekly reporting",
  ];

  if ((card.score?.automationPotential ?? 0) >= 7) {
    skills.push("workflow automation mapping");
  }
  if (card.validationPlan) {
    skills.push("evidence tracking");
  }

  return skills;
}

function knowledgeForCard(card: VentureCard): string[] {
  const knowledge = [
    "venture brief",
    "target customer profile",
    "problem and offer notes",
    "safe autonomy boundaries",
  ];

  if (card.score) {
    knowledge.push("CEO score and recommendation bands");
  }
  if (card.validationPlan) {
    knowledge.push("validation plan and kill criteria");
  }

  return knowledge;
}

function recommendationReason(card: VentureCard, recommended: boolean): string {
  if (isAgentBuildLocked(card)) {
    return "Terminal or killed venture: preserve history, do not build an agent for active work.";
  }
  if (!recommended) {
    return "Agent build is not the next highest-leverage move yet; keep CEO attention on scoring or validation clarity.";
  }
  if (card.score?.recommendation === "go") {
    return "Go recommendation plus useful automation surface: a specialist agent blueprint may improve validation speed.";
  }
  if (card.score?.recommendation === "test_small") {
    return "Test-small recommendation: a narrow specialist agent can reduce CEO workload during validation.";
  }
  if (card.status === "validating" || card.status === "operating") {
    return "Active venture: a specialist agent blueprint can standardize research, reporting, and evidence capture.";
  }
  return "Automation and strategic-fit signals are high enough to prepare an agent blueprint.";
}

export function buildVentureAgentBuildPlan(card: VentureCard): VentureAgentBuildPlan {
  const recommended = shouldRecommendAgentBuild(card);
  return {
    id: `agent-build-plan-${card.id}`,
    ventureId: card.id,
    ventureName: card.name,
    recommended,
    recommendationReason: recommendationReason(card, recommended),
    expectedProfitabilityLift: expectedLift(card, recommended),
    proposedAgentRole: `${card.name} Venture Specialist`,
    skillsToBuild: skillsForCard(card),
    knowledgeToLoad: knowledgeForCard(card),
    autonomyDomains: SAFE_AGENT_DOMAINS,
    blockedCapabilities: BLOCKED_AGENT_CAPABILITIES,
    buildMode: "blueprint_only",
    humanOnTheLoop: true,
    noExecutionAuthorized: true,
  };
}

export function summarizeVentureAgentBuildPlans(
  cards: VentureCard[],
): VentureAgentBuildPlanSummary {
  const plans = cards
    .map(buildVentureAgentBuildPlan)
    .sort((left, right) => {
      if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
      const liftRank = { high: 0, medium: 1, low: 2 };
      const liftDelta = liftRank[left.expectedProfitabilityLift] - liftRank[right.expectedProfitabilityLift];
      if (liftDelta !== 0) return liftDelta;
      return left.ventureName.localeCompare(right.ventureName);
    });

  return {
    totalCount: plans.length,
    recommendedCount: plans.filter((plan) => plan.recommended).length,
    highLiftCount: plans.filter((plan) => plan.expectedProfitabilityLift === "high").length,
    plans,
    nextRecommendedPlan: plans.find((plan) => plan.recommended) ?? null,
  };
}
