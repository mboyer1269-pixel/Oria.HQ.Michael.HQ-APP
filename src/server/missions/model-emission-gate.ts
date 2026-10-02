// src/server/missions/model-emission-gate.ts
//
// The authenticated caller that assembles ONE ServerCapability entry from
// real, server-side facts and asks Cursor's existing assessServerEmission()
// (src/server/ai/server-capability-catalog.ts — Cursor's exclusive router
// surface, imported here, never modified) whether emission may proceed.
//
// This is the connection point between:
//   - workspace authentication (the caller's own request boundary)
//   - provider connection discovery (../agents/models/provider-connection-discovery.ts)
//   - the model registry/catalog (../agents/models/provider-registry-contract.ts)
//   - an explicit, separately-decided authorization fact (never self-granted
//     here — "connected" and "authorized" stay different axes)
// It does not reimplement assessServerEmission's gating logic, does not
// build a second catalog or router, and does not call a provider or spend
// anything. The public model LIST (the mockup's catalog) is not account
// discovery and never enters this file as a source of "connected" or
// "authorized" — only a real ProviderConnectionSnapshot can.
//
// Fail-closed on every input this module alone can see: a cross-workspace
// request, a missing connection snapshot, a missing authorization decision,
// or a missing tariff all refuse emission before assessServerEmission is
// even called — each with its own named status, never folded into a generic
// "denied" that would hide which prerequisite was absent.

import {
  assessServerEmission,
  type ServerCapability,
  type ServerCapabilityCatalog,
  type ServerEmissionAssessment,
  type ServerTariff,
} from "@/server/ai/server-capability-catalog";
import {
  isExecutionReady,
  type ProviderConnectionSnapshot,
} from "../agents/models/provider-connection-discovery";
import type { ProviderRegistry } from "../agents/models/provider-registry-contract";

export type ModelEmissionAuthorizationDecision = {
  authorized: boolean;
  /** Who/what authorized it (a mission approval id, an actor id, ...). Never issued by this module. */
  authorizedBy: string;
  authorizedAtIso: string;
};

export type ModelEmissionGateRequest = {
  workspaceId: string;
  /** The workspace the caller is actually authenticated as. Must equal workspaceId. */
  requestingWorkspaceId: string;
  modelId: string;
  requiresTools: boolean;
  registry: ProviderRegistry;
  /** A real discovery result (see provider-connection-discovery.ts). Never inferred, never defaulted. */
  connectionSnapshot: ProviderConnectionSnapshot | null;
  /** The caller's own authorization decision. This module never derives one. */
  authorization: ModelEmissionAuthorizationDecision | null;
  tariff: ServerTariff | null;
  nowMs: number;
};

export type ModelEmissionGateResult =
  | { status: "ok"; assessment: ServerEmissionAssessment }
  | { status: "cross_workspace_denied" }
  | { status: "invalid_request" }
  | { status: "connection_discovery_missing" }
  | { status: "authorization_missing" }
  | { status: "budget_missing" };

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

/**
 * Builds exactly one ServerCapability entry — for the requested model and
 * workspace only, never a full catalog dump — from real registry +
 * discovery facts, then runs it through Cursor's own assessServerEmission().
 * "authorized" is set on the entry ONLY when request.authorization says so;
 * a connected-but-unauthorized model is deliberately capped at "connected",
 * which assessServerEmission itself blocks as "not_authorized".
 */
export function evaluateModelEmissionGate(request: ModelEmissionGateRequest): ModelEmissionGateResult {
  if (
    !isNonEmptyId(request?.workspaceId) ||
    !isNonEmptyId(request?.requestingWorkspaceId) ||
    !isNonEmptyId(request?.modelId) ||
    typeof request?.requiresTools !== "boolean" ||
    !request?.registry ||
    !Number.isFinite(request?.nowMs)
  ) {
    return { status: "invalid_request" };
  }
  if (request.requestingWorkspaceId !== request.workspaceId) {
    return { status: "cross_workspace_denied" };
  }
  if (!request.connectionSnapshot) {
    return { status: "connection_discovery_missing" };
  }
  if (!request.authorization) {
    return { status: "authorization_missing" };
  }
  if (!request.tariff) {
    return { status: "budget_missing" };
  }

  const model = request.registry.getModel(request.modelId);
  const nowIso = new Date(request.nowMs).toISOString();
  const observedAt = request.connectionSnapshot.checkedAtIso || nowIso;

  let entry: ServerCapability | null = null;
  if (model) {
    const connectionEntry = request.connectionSnapshot.entries.find(
      (candidate) => candidate.providerId === model.providerId,
    );
    const connected = connectionEntry ? isExecutionReady(connectionEntry) : false;
    const state: ServerCapability["state"] = !connected
      ? "listed"
      : request.authorization.authorized
        ? "authorized"
        : "connected";
    entry = {
      modelId: model.id,
      provider: model.providerId,
      state,
      source: connectionEntry?.evidence?.[0] ?? "provider-connection-discovery:no-entry",
      observedAt,
      tools: model.supportsToolUse,
      tariff: request.tariff,
      workspaceId: request.workspaceId,
    };
  }

  const catalog: ServerCapabilityCatalog = {
    source: "hq-model-emission-gate-v1",
    observedAt,
    entries: entry ? [entry] : [],
  };

  const assessment = assessServerEmission({
    catalog,
    modelId: request.modelId,
    workspaceId: request.workspaceId,
    requiresTools: request.requiresTools,
    nowMs: request.nowMs,
  });

  return { status: "ok", assessment };
}
