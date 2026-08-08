// src/server/agents/validation-report-store.ts
//
// Persisted market-validation reports after CEO approval.

import type { EstimatedCost } from "@/server/michael-hq/telemetry";

export type MarketSizing = {
  tamUsd: number;
  samUsd: number;
  somUsd: number;
  currency: "USD";
  rationale: string;
};

export type AcquisitionChannel = {
  channel: string;
  fit: "high" | "medium" | "low";
  notes: string;
};

export type DemandCheckReport = {
  reportId: string;
  workspaceId: string;
  modeId: string;
  intentId: string;
  agentId: string;
  title: string;
  projectBrief: string;
  marketSizing: MarketSizing;
  acquisitionChannels: AcquisitionChannel[];
  demandVerdict: "proceed" | "iterate" | "kill";
  evidenceSummary: string;
  createdAt: string;
  approvedAt: string;
  estimatedCost: EstimatedCost | null;
};

const reportsByWorkspace = new Map<string, DemandCheckReport[]>();

export function saveValidationReport(report: DemandCheckReport): DemandCheckReport {
  const list = reportsByWorkspace.get(report.workspaceId) ?? [];
  list.unshift(report);
  reportsByWorkspace.set(report.workspaceId, list);
  return report;
}

export function listValidationReports(workspaceId: string): DemandCheckReport[] {
  return [...(reportsByWorkspace.get(workspaceId) ?? [])];
}

export function getValidationReport(
  workspaceId: string,
  reportId: string,
): DemandCheckReport | null {
  return listValidationReports(workspaceId).find((r) => r.reportId === reportId) ?? null;
}
