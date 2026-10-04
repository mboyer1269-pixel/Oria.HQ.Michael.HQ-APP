// src/server/agents/models/provider-connection-discovery.ts
//
// Provider Connection Discovery — server-side, workspace-scoped discovery of
// which registered providers/runtime adapters are ACTUALLY connected, as
// distinct from merely catalogued (model-provider-contract.ts) or merely
// selectable (model-selection-policy.ts). Three separate facts:
//   listed      -> ProviderRegistry (catalog)
//   connected   -> this module (observed, server-side)
//   authorized  -> the caller's own permission layer (checkPermission, Sentinelle)
// This module answers only the middle one, and never the other two.
//
// Doctrine, consistent with ../runtimes/local-runtime-probe.ts:
//   - Detection is not permission. A "connected" verdict never authorizes
//     tool use or execution by itself.
//   - A capability a provider merely DECLARES (a documented endpoint, a
//     catalog flag) is never treated as proof that it EXECUTES. `source`
//     records which kind of evidence grounded the verdict, and
//     isExecutionReady() refuses to call "declared-capability" sufficient.
//   - Absence of evidence is "unknown", never "connected". A probe that
//     throws, rejects, times out, or returns a malformed outcome becomes
//     "unknown" — never silently promoted and never turned into a specific
//     "connection_required" claim it did not actually make.
//   - Workspace isolation: a discovery answer for workspace A can never be
//     returned to a caller authenticated as workspace B.
//   - No secret value ever enters this module's output — a probe may report
//     only enum states, short, pre-redacted evidence strings, and (if it has
//     genuine per-account evidence) a safe accountId — never a raw
//     identifier. A profile/config identity (e.g. a policy id) is NEVER a
//     substitute for an attested accountId: a profile names a POLICY, not
//     the account actually connected behind it. Absence of an attested
//     accountId must be refused explicitly by callers that need one, never
//     inferred or defaulted.
//
// Pure where it can be: resolution takes an injected probe (the I/O boundary)
// and an injected clock; this module itself never calls fetch, reads
// process.env, or spawns a process.

import type {
  ModelProviderDescriptor,
  RuntimeAdapterDescriptor,
} from "./model-provider-contract";
import type { ProviderRegistry } from "./provider-registry-contract";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type ConnectionState = "connected" | "connection_required" | "unknown";

/**
 * What kind of evidence grounded a probe's verdict. "declared-capability" is
 * documentation or a self-reported capabilities flag — never alone enough
 * for isExecutionReady(). "exercised-capability" means a real call was
 * actually observed to succeed.
 */
export type ConnectionEvidenceSource =
  | "env-key-presence"
  | "oauth-external-marker"
  | "cli-subscription-login"
  | "declared-capability"
  | "exercised-capability";

const CONNECTION_STATES: readonly ConnectionState[] = [
  "connected",
  "connection_required",
  "unknown",
];
const EVIDENCE_SOURCES: readonly ConnectionEvidenceSource[] = [
  "env-key-presence",
  "oauth-external-marker",
  "cli-subscription-login",
  "declared-capability",
  "exercised-capability",
];

export function isConnectionState(value: unknown): value is ConnectionState {
  return typeof value === "string" && CONNECTION_STATES.includes(value as ConnectionState);
}

export function isEvidenceSource(value: unknown): value is ConnectionEvidenceSource {
  return typeof value === "string" && EVIDENCE_SOURCES.includes(value as ConnectionEvidenceSource);
}

// ---------------------------------------------------------------------------
// Probe boundary — the ONLY door to real I/O
// ---------------------------------------------------------------------------

export type ProviderConnectionProbeOutcome = {
  connectionState: ConnectionState;
  source: ConnectionEvidenceSource;
  /** Present only when not connected: the smallest action that would change it. */
  requiredAction?: string;
  /** Short, already-redacted evidence lines. Never a secret value or full payload. */
  evidence?: readonly string[];
  /**
   * A safe, non-raw ATTESTATION of which specific account the probe
   * observed — never an email, token, org name, or other raw identifier.
   * Present ONLY when the probe has genuine, per-account evidence; absent
   * when it does not (e.g. a probe that can only prove "a subscription is
   * logged in", not "which one"). Absence is never read by any caller as
   * "same account as a previous observation" — callers that need an
   * account identity must refuse explicitly on absence, never infer one or
   * fall back to a profile/config identity instead.
   */
  accountId?: string;
};

export type ProviderConnectionProbe = (
  provider: ModelProviderDescriptor,
  adapters: readonly RuntimeAdapterDescriptor[],
) => Promise<ProviderConnectionProbeOutcome>;

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export type ProviderConnectionEntry = {
  providerId: string;
  connectionState: ConnectionState;
  source: ConnectionEvidenceSource;
  checkedAtIso: string;
  requiredAction?: string;
  evidence: readonly string[];
  /** See ProviderConnectionProbeOutcome.accountId — same doctrine, carried through unmodified. */
  accountId?: string;
};

export type ProviderConnectionSnapshot = {
  workspaceId: string;
  checkedAtIso: string;
  entries: readonly ProviderConnectionEntry[];
};

export type ProviderConnectionDiscoveryRequest = {
  workspaceId: string;
  /** The workspace the caller is actually authenticated as. Must equal workspaceId. */
  requestingWorkspaceId: string;
  probe: ProviderConnectionProbe;
  nowIso?: string;
};

export type ProviderConnectionDiscoveryResult =
  | { status: "ok"; snapshot: ProviderConnectionSnapshot }
  | { status: "cross_workspace_denied" }
  | { status: "invalid_request" };

const MAX_EVIDENCE_LINES = 10;
const MAX_EVIDENCE_LENGTH = 200;

function clampEvidence(evidence: readonly string[] | undefined): readonly string[] {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter((line): line is string => typeof line === "string")
    .slice(0, MAX_EVIDENCE_LINES)
    .map((line) => (line.length > MAX_EVIDENCE_LENGTH ? `${line.slice(0, MAX_EVIDENCE_LENGTH)}…` : line));
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 160;
}

/**
 * Resolves connection state for every provider in the registry, for one
 * workspace. Each provider is probed independently; one probe's failure
 * never affects another's result. A probe that throws, rejects, or returns
 * a malformed outcome becomes "unknown" for that provider only.
 */
export async function resolveProviderConnectionDiscovery(
  registry: ProviderRegistry,
  request: ProviderConnectionDiscoveryRequest,
): Promise<ProviderConnectionDiscoveryResult> {
  if (!isNonEmptyId(request?.workspaceId) || !isNonEmptyId(request?.requestingWorkspaceId)) {
    return { status: "invalid_request" };
  }
  if (request.requestingWorkspaceId !== request.workspaceId) {
    return { status: "cross_workspace_denied" };
  }
  if (typeof request.probe !== "function") {
    return { status: "invalid_request" };
  }

  const checkedAtIso = request.nowIso ?? new Date().toISOString();
  const providers = registry.listProviders();

  const entries = await Promise.all(
    providers.map(async (provider): Promise<ProviderConnectionEntry> => {
      const adapters = registry.listAdaptersForProvider(provider.id);
      try {
        const outcome = await request.probe(provider, adapters);
        const state = isConnectionState(outcome?.connectionState) ? outcome.connectionState : "unknown";
        const source = isEvidenceSource(outcome?.source) ? outcome.source : "declared-capability";
        return {
          providerId: provider.id,
          connectionState: state,
          source,
          checkedAtIso,
          requiredAction: state === "connected" ? undefined : outcome?.requiredAction,
          evidence: clampEvidence(outcome?.evidence),
          // A malformed or absent accountId is dropped, never coerced or
          // guessed — same validation already used for every other id in
          // this module, not a new check invented for this field alone.
          accountId: isNonEmptyId(outcome?.accountId) ? outcome.accountId : undefined,
        };
      } catch {
        return {
          providerId: provider.id,
          connectionState: "unknown",
          source: "declared-capability",
          checkedAtIso,
          requiredAction: "discovery probe failed — retry before relying on this provider",
          evidence: [],
        };
      }
    }),
  );

  return { status: "ok", snapshot: { workspaceId: request.workspaceId, checkedAtIso, entries } };
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

/** A malformed or missing timestamp is always stale — never "fresh by default". */
export function isProviderConnectionSnapshotStale(
  snapshot: Pick<ProviderConnectionSnapshot, "checkedAtIso"> | null | undefined,
  nowIso: string,
  maxAgeMs: number,
): boolean {
  const checked = Date.parse(snapshot?.checkedAtIso ?? "");
  const now = Date.parse(nowIso);
  if (!Number.isFinite(checked) || !Number.isFinite(now)) return true;
  return now - checked > maxAgeMs;
}

// ---------------------------------------------------------------------------
// Execution-readiness — where "declared" is refused as proof
// ---------------------------------------------------------------------------

/**
 * True only when a provider is both "connected" AND grounded in evidence
 * stronger than a self-declared capability. This is the single place that
 * encodes "a declared capability is not proof of execution" — every
 * consumer of this module goes through here rather than re-deciding it.
 */
export function isExecutionReady(
  entry: Pick<ProviderConnectionEntry, "connectionState" | "source">,
): boolean {
  return entry.connectionState === "connected" && entry.source !== "declared-capability";
}

// ---------------------------------------------------------------------------
// Bridge into model-selection-policy — no second router
// ---------------------------------------------------------------------------

/**
 * Bridges this module's observation into model-selection-policy's EXISTING
 * input, `ModelSelectionRequest.unavailableModelIds`. This is the entire
 * connection point: selectModel() itself is untouched and unduplicated.
 *
 * Fail-closed by construction: a model is unavailable unless its provider's
 * connection entry passes isExecutionReady(). A provider absent from the
 * snapshot (e.g. a stale or partial discovery) is treated the same as
 * "connection_required" — silence is never read as availability.
 */
export function deriveUnavailableModelIds(
  registry: ProviderRegistry,
  snapshot: ProviderConnectionSnapshot,
): readonly string[] {
  const byProviderId = new Map(snapshot.entries.map((entry) => [entry.providerId, entry]));
  return registry
    .listModels()
    .filter((model) => {
      const entry = byProviderId.get(model.providerId);
      return !entry || !isExecutionReady(entry);
    })
    .map((model) => model.id);
}
