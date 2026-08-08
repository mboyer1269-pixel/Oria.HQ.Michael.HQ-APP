// src/server/agents/engineering-package-store.ts
//
// Persisted code packages delivered after CEO approval — portable IaC, zero
// autonomous deploy. Local fallback when Supabase is not configured.

import type { EstimatedCost } from "@/server/michael-hq/telemetry";

export type EngineeringPackageFile = {
  path: string;
  content: string;
};

export type InfrastructureCodePackage = {
  packageId: string;
  workspaceId: string;
  modeId: string;
  intentId: string;
  agentId: string;
  title: string;
  brief: string;
  files: EngineeringPackageFile[];
  createdAt: string;
  approvedAt: string;
  estimatedCost: EstimatedCost | null;
  exportTargets: ("download" | "github" | "terraform" | "docker")[];
};

const packagesByWorkspace = new Map<string, InfrastructureCodePackage[]>();

export function saveInfrastructurePackage(pkg: InfrastructureCodePackage): InfrastructureCodePackage {
  const list = packagesByWorkspace.get(pkg.workspaceId) ?? [];
  list.unshift(pkg);
  packagesByWorkspace.set(pkg.workspaceId, list);
  return pkg;
}

export function listInfrastructurePackages(workspaceId: string): InfrastructureCodePackage[] {
  return [...(packagesByWorkspace.get(workspaceId) ?? [])];
}

export function getInfrastructurePackage(
  workspaceId: string,
  packageId: string,
): InfrastructureCodePackage | null {
  return listInfrastructurePackages(workspaceId).find((p) => p.packageId === packageId) ?? null;
}
