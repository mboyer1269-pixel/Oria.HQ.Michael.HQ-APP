// src/server/missions/model-emission-gate.ts
//
// A PURE caller that assembles ONE ServerCapability entry from real,
// server-side facts and asks Cursor's existing assessServerEmission()
// (src/server/ai/server-capability-catalog.ts — Cursor's exclusive router
// surface, imported here, never modified) whether emission may proceed.
//
// NOT yet an authenticated endpoint. This module takes workspaceId and
// requestingWorkspaceId as plain arguments and trusts the caller to have
// derived them from a real authenticated session — it has no HTTP route,
// no cookie/session read, and no wiring to one today. The missing piece is
// named explicitly rather than stubbed: a route (e.g. under
// src/app/api/missions/...) that resolves the authenticated workspace from
// the request context and calls evaluateModelEmissionGate() with that
// workspace as BOTH workspaceId and requestingWorkspaceId still needs to be
// written and is not part of this lot.
//
// This is the connection point between:
//   - provider connection discovery (../agents/models/provider-connection-discovery.ts)
//   - the model registry/catalog (../agents/models/provider-registry-contract.ts)
//   - an explicit, separately-decided authorization fact (never self-granted
//     here — "connected" and "authorized" stay different axes)
//   - Cursor's billingKind/tariff contract (api | verified_free | subscription)
// It does not reimplement assessServerEmission's gating logic, does not
// build a second catalog or router, and does not call a provider or spend
// anything. The public model LIST (the mockup's catalog) is not account
// discovery and never enters this file as a source of "connected" or
// "authorized" — only a real ProviderConnectionSnapshot can.
//
// billingKind is DERIVED, never asked of the caller: a connection observed
// via a CLI/OAuth subscription (source "cli-subscription-login" or
// "oauth-external-marker") is "subscription"; otherwise a catalog-proven
// zero-pricing model is "verified_free"; everything else is "api". Only
// "api" ever carries a tariff — asking the caller for a tariff on a
// subscription model would be asking for a fact that structurally cannot
// exist (per Cursor's contract, tariff must be null there), so
// "budget_missing" is only ever raised for "api".
//
// Fail-closed on every input this module alone can see, each with its own
// named status — never folded into one generic "denied" that would hide
// which prerequisite was absent:
//   - a cross-workspace REQUEST (workspaceId vs requestingWorkspaceId)
//   - a connection snapshot that is itself scoped to a DIFFERENT workspace
//     than the one requested (checked against snapshot.workspaceId itself,
//     not only against the two request-side ids)
//   - a missing connection snapshot or authorization decision
//   - a missing tariff, but ONLY when the resolved billing kind is "api"

import {
  assessServerEmission,
  type ServerBillingKind,
  type ServerCapability,
  type ServerCapabilityCatalog,
  type ServerEmissionAssessment,
  type ServerTariff,
} from "@/server/ai/server-capability-catalog";
import { isProvenZeroPricing, type ModelPricingDescriptor } from "../agents/models/model-provider-contract";
import {
  isExecutionReady,
  type ConnectionEvidenceSource,
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
  /** Required ONLY when the resolved billing kind turns out to be "api". Ignored (forced null) otherwise. */
  tariff: ServerTariff | null;
  /** The adapter/provider that would actually be invoked, forwarded to assessServerEmission's invokedProvider match. */
  invokedProviderId?: string;
  nowMs: number;
};

export type ModelEmissionGateResult =
  | { status: "ok"; assessment: ServerEmissionAssessment }
  | { status: "cross_workspace_denied" }
  | { status: "connection_snapshot_workspace_mismatch" }
  | { status: "invalid_request" }
  | { status: "connection_discovery_missing" }
  | { status: "authorization_missing" }
  | { status: "budget_missing" };

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

/**
 * subscription/OAuth-external evidence outranks pricing: an account reached
 * through a CLI or OAuth-external login is never metered per token the way
 * an API key is, whatever the catalog says about the model's price.
 */
const SUBSCRIPTION_EVIDENCE_SOURCES: readonly ConnectionEvidenceSource[] = [
  "cli-subscription-login",
  "oauth-external-marker",
];

function deriveBillingKind(
  connectionSource: ConnectionEvidenceSource | undefined,
  pricing: ModelPricingDescriptor | undefined,
): ServerBillingKind {
  if (connectionSource && SUBSCRIPTION_EVIDENCE_SOURCES.includes(connectionSource)) {
    return "subscription";
  }
  if (pricing && isProvenZeroPricing(pricing)) {
    return "verified_free";
  }
  return "api";
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
  // The snapshot's OWN workspace scope, not only the two request-side ids:
  // a snapshot resolved for a different workspace must never be accepted
  // just because the request-side ids happen to agree with each other.
  if (request.connectionSnapshot.workspaceId !== request.workspaceId) {
    return { status: "connection_snapshot_workspace_mismatch" };
  }
  if (!request.authorization) {
    return { status: "authorization_missing" };
  }

  const nowIso = new Date(request.nowMs).toISOString();
  const model = request.registry.getModel(request.modelId);

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
    const billingKind = deriveBillingKind(connectionEntry?.source, model.pricing);

    if (state === "authorized" && billingKind === "api" && !request.tariff) {
      return { status: "budget_missing" };
    }

    entry = {
      modelId: model.id,
      provider: model.providerId,
      state,
      source: connectionEntry?.evidence?.[0] ?? "provider-connection-discovery:no-entry",
      // The ENTRY's own observed-at, from the specific provider's discovery
      // check — never the snapshot-level timestamp, which could stay fresh
      // while one individual provider entry inside it is actually stale.
      observedAt: connectionEntry?.checkedAtIso ?? nowIso,
      tools: model.supportsToolUse,
      billingKind,
      tariff: billingKind === "api" ? request.tariff ?? null : null,
      workspaceId: request.workspaceId,
    };
  }

  const catalog: ServerCapabilityCatalog = {
    source: "hq-model-emission-gate-v1",
    observedAt: nowIso,
    entries: entry ? [entry] : [],
  };

  const assessment = assessServerEmission({
    catalog,
    modelId: request.modelId,
    workspaceId: request.workspaceId,
    requiresTools: request.requiresTools,
    nowMs: request.nowMs,
    invokedProvider: request.invokedProviderId,
  });

  return { status: "ok", assessment };
}
