// Memory Wiki domain types.
//
// Operational memory + holding scoreboard for Oria HQ / SOVRA. These are
// view-model types backing a read-only UI with static mock data — no DB, no
// writes, no runtime wiring. The shapes are forward-compatible with a future
// persistence layer (PR "Memory Log Contract" → "Save Daily Log to Supabase").

export type MemorySubjectStatus = "active" | "building" | "planned" | "paused";

export type MemorySubject = {
  id: string;
  title: string;
  status: MemorySubjectStatus;
  summary: string;
  decisions: string[];
  risks: string[];
  nextActions: string[];
  relatedRefs: string[];
  lastUpdated: string;
};

export type AgentScore = {
  agentId: string;
  agentName: string;
  ventureId?: string;
  score: number;
  outputsAccepted: number;
  revenueInfluencedCents: number;
  revenueLabel: string;
  estimatedCostCents: number;
  riskIncidents: number;
  notes: string;
};

export type DailyLog = {
  date: string;
  summary: string;
  mergedPrs: string[];
  decisions: string[];
  blockers: string[];
  moneyInCents: number;
  moneyOutCents: number;
  topAgentId: string;
  nextActions: string[];
};

export type Moneyboard = {
  periodLabel: string;
  moneyInCents: number;
  moneyOutCents: number;
  pipelineEstimatedCents: number;
  aiRuntimeCostCents: number;
  inBreakdown: { label: string; amountCents: number }[];
  outBreakdown: { label: string; amountCents: number }[];
};

export type VentureProgressStatus = "on_track" | "at_risk" | "early" | "blocked";

export type VentureProgress = {
  id: string;
  name: string;
  status: VentureProgressStatus;
  summary: string;
  mrrTargetCents: number;
  mrrCurrentCents: number;
  nextAction: string;
  riskStatus: string;
};
