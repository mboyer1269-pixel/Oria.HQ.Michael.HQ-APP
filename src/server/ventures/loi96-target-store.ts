// src/server/ventures/loi96-target-store.ts
//
// Loi 96 pipeline — FILE-BACKED target store (P1, Le Pont).
//
// Source of truth: ventures/loi96/pipeline.json (versioned in git). Every
// mutation is written back to the file, so the pipeline survives restarts and
// every change is committable. This is the durability lesson of 2026-06-11
// applied: venture data never lives only in memory again.
//
// This store NEVER sends anything. The bridge to the Send Desk lives in the
// owner-gated server actions.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Loi96TargetStatus =
  | "to_verify"
  | "audit_to_rebuild"
  | "audit_ready"
  | "queued"
  | "sent"
  | "replied"
  | "call_booked"
  | "signed"
  | "lost";

export type Loi96Target = {
  name: string;
  domain: string;
  tier: number;
  status: Loi96TargetStatus | string;
  audit: string | null;
  contact: string | null;
  angle: string;
  sentDate: string | null;
  replyDate: string | null;
  signedValue: number;
  /** Send Desk action id once queued (bridge linkage). */
  outboundActionId?: string;
};

export type Loi96Pipeline = {
  updated: string;
  venture: string;
  weeklyGoal: { auditsSent: number; label: string };
  killMetrics: string[];
  targets: Loi96Target[];
  [key: string]: unknown;
};

function pipelinePath(): string {
  return join(process.cwd(), "ventures", "loi96", "pipeline.json");
}

export function loadLoi96Pipeline(): Loi96Pipeline | null {
  const path = pipelinePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Loi96Pipeline;
  } catch {
    return null;
  }
}

function savePipeline(pipeline: Loi96Pipeline): void {
  pipeline.updated = new Date().toISOString().slice(0, 10);
  writeFileSync(pipelinePath(), JSON.stringify(pipeline, null, 2) + "\n", "utf-8");
}

export type Loi96UpdateResult =
  | { ok: true; target: Loi96Target }
  | { ok: false; reason: string };

export function updateLoi96Target(
  domain: string,
  patch: Partial<Pick<Loi96Target, "status" | "sentDate" | "replyDate" | "signedValue" | "outboundActionId" | "contact">>,
): Loi96UpdateResult {
  const pipeline = loadLoi96Pipeline();
  if (!pipeline) return { ok: false, reason: "pipeline.json introuvable" };
  const target = pipeline.targets.find((candidate) => candidate.domain === domain);
  if (!target) return { ok: false, reason: `cible inconnue: ${domain}` };
  Object.assign(target, patch);
  savePipeline(pipeline);
  return { ok: true, target };
}
