import type { HermesAgent, HermesFleetSummary } from "@/features/hq/types";

export function summarizeFleet(agents: HermesAgent[]): HermesFleetSummary {
  return agents.reduce<HermesFleetSummary>(
    (acc, agent) => ({
      totalAgents: acc.totalAgents + 1,
      activeAgents: acc.activeAgents + (agent.status === "active" ? 1 : 0),
      supervisedAgents:
        acc.supervisedAgents + (agent.approvalMode !== "autonomous" ? 1 : 0),
      weeklyHoursSaved: acc.weeklyHoursSaved + agent.weeklyHoursSaved,
      monthlyRevenuePotential:
        acc.monthlyRevenuePotential + agent.monthlyRevenuePotential,
    }),
    {
      totalAgents: 0,
      activeAgents: 0,
      supervisedAgents: 0,
      weeklyHoursSaved: 0,
      monthlyRevenuePotential: 0,
    }
  );
}

export function needsHumanGate(agent: HermesAgent): boolean {
  return (
    agent.approvalMode !== "autonomous" ||
    agent.allowedActions.some((action) => action.includes("send"))
  );
}
