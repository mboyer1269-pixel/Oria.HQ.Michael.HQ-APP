// src/features/agents/execution-intent-review-projection.ts
//
// Pure projection for the CEO execution-intent review panel on /hq/agents.
// Maps an AgentExecutionIntent (the dispatchable action queued for CEO approval)
// into a flat, display-only row, and resolves the panel's high-level state so
// the UI never has to reason about the raw model.
//
// Dependency-free and pure: no Supabase, no React, no clock, no network. The
// page reads pending intents server-side; this module owns the display shape.

import type { AgentExecutionIntent, AgentExecutionIntentStatus } from "@/features/agents/execution-intent";

export type ExecutionIntentReviewRow = {
  intentId: string;
  agentId: string;
  skillId: string;
  actionType: string;
  actionRef: string | null;
  status: AgentExecutionIntentStatus;
  createdAt: string;
  autonomyLevel: number;
  toolName: string;
  // Minimal, human-readable summary of the dispatch payload. No secrets here —
  // these are the same fields the n8n webhook contract already exposes.
  payloadSummary: {
    client: string;
    email: string;
    missionId: string;
    ventureId: string | null;
    dataKeys: string[];
  };
};

/** Projects a single execution intent into a display-only review row. */
export function projectExecutionIntentForReview(
  intent: AgentExecutionIntent,
): ExecutionIntentReviewRow {
  const { payload } = intent;
  const dataKeys =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
      ? Object.keys(payload.data)
      : [];

  return {
    intentId: intent.intentId,
    agentId: intent.agentId,
    skillId: intent.skillId,
    actionType: payload.actionType,
    actionRef: intent.actionRef ?? null,
    status: intent.status,
    createdAt: intent.createdAt,
    autonomyLevel: intent.autonomyLevel,
    toolName: intent.toolName,
    payloadSummary: {
      client: payload.client,
      email: payload.email,
      missionId: payload.missionId,
      ventureId: payload.ventureId ?? null,
      dataKeys,
    },
  };
}

/** Projects a list of execution intents, preserving order (most-recent first). */
export function projectExecutionIntentsForReview(
  intents: readonly AgentExecutionIntent[],
): ExecutionIntentReviewRow[] {
  return intents.map(projectExecutionIntentForReview);
}

// High-level panel state. `not_configured` is the graceful-degradation state
// surfaced when the rail (table/migration 0024) is unavailable — the page must
// never crash in that case.
export type ExecutionIntentPanelState = "not_configured" | "empty" | "has_pending";

export function resolveExecutionIntentPanelState(input: {
  railConfigured: boolean;
  rows: readonly ExecutionIntentReviewRow[];
}): ExecutionIntentPanelState {
  if (!input.railConfigured) return "not_configured";
  return input.rows.length === 0 ? "empty" : "has_pending";
}
