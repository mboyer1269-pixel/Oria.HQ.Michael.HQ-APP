// src/server/agents/models/runner-connection-evidence.ts
//
// A second, explicitly-selected ProviderConnectionProbe transport for the
// same provider runner-executor-connection-probe.ts covers
// ("claude-code-cli" on the OpenHands runner host). That file's SSH
// transport refuses unconditionally under any cloud marker and is not
// modified here. This module lets HQ's own cloud process consume, as DATA,
// an attestation an operator-adjacent host already produced by running that
// same SSH probe.
//
// Transport selection (model-emission-launch-gate.ts's
// createDefaultConnectionProbe) is explicit and closed by default — never
// inferred from a probe's own refusal message, because that message does
// not distinguish a revoked operator approval from simply running on a
// cloud host.
//
// Persisted mode has its own explicit, approved, workspace/provider/runner/
// container-bound consumption binding (loadConnectionEvidenceBinding) —
// never the SSH binding. A stored row must also match the CURRENT canonical
// launch policy digest (providerProfile.policySha256 from the same
// ORIA_OPENHANDS_LAUNCH_CONFIG model-emission-launch-gate.ts reads) and the
// runner it names; a row recorded under a since-changed policy or runner
// refuses even if its account/connection state is otherwise positive and
// fresh. Freshness is a strict, bounded window: a future-dated or aged-out
// row, a non-"connected" row, a "declared-capability"-only source, or a
// missing accountId all refuse the same way.
//
// What this is NOT: a replacement for the executor's own fresh ACP
// handshake immediately before a prompt is sent. A persisted row proves
// only that a probe observed a connected account at that moment; it
// unblocks HQ's own confirm_launch account-identity check and nothing
// downstream of it. The gap between this evidence and the moment the
// runner host actually starts a container is the same TOCTOU window
// model-emission-launch-gate.ts's own re-check already names and does not
// claim to close for any transport.
//
// Evidence is produced only by the runner operator, off this process, using
// the real SSH probe and the existing opaque account-identity repository —
// recordRunnerConnectionEvidence never invents an accountId or a policy
// digest and refuses to persist a "connected" claim lacking either. It also
// refuses to run outside the same operator/non-cloud environment the SSH
// probe itself requires (resolveRunnerProbeEnvironment, imported
// unmodified).
//
// Transport: the existing Supabase admin client, already used for account
// identities, launch authority, and approval records. No new credential, no
// new endpoint. RLS mirrors account_identities: service_role only, no
// client policies (db/migrations/0031, candidate, not applied by this
// change).

import "server-only";
import { z } from "zod";
import { createOptionalSupabaseAdminClient } from "@/server/supabase/admin";
import { launchConfigSchema } from "@/core/openhands-launch-contract";
import {
  resolveRunnerProbeEnvironment,
  readRunnerProbeBinding,
  createRunnerSshCommandRunner,
  createRunnerClaudeCliConnectionProbe,
  RUNNER_SSH_HOST_ENV_VAR,
  RUNNER_SSH_IDENTITY_FILE_ENV_VAR,
  type RunnerProbeBinding,
} from "./runner-executor-connection-probe";
import {
  isConnectionState,
  isEvidenceSource,
  type ProviderConnectionProbe,
  type ProviderConnectionProbeOutcome,
} from "./provider-connection-discovery";
import type {
  ModelProviderDescriptor,
} from "./model-provider-contract";

// ---------------------------------------------------------------------------
// Vocabulary shared by both directions
// ---------------------------------------------------------------------------

/** The only provider this module speaks for today — mirrors the SSH probe. */
export const EVIDENCE_PROVIDER_ID = "claude-code-cli" as const;

const idSchema = z.string().min(1).max(160);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const containerSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const isoTimestamp = z.iso.datetime({ offset: true });

const EVIDENCE_PROVIDER: ModelProviderDescriptor = {
  id: EVIDENCE_PROVIDER_ID,
  label: "Claude Code CLI subscription (OpenHands executor)",
  kind: "api",
  trustLevel: "reviewed",
  supportsMcp: false,
  supportsToolUse: true,
};

// ---------------------------------------------------------------------------
// Canonical policy/runner digest — the single authority, never duplicated
// ---------------------------------------------------------------------------

const LAUNCH_CONFIG_ENV_VAR = "ORIA_OPENHANDS_LAUNCH_CONFIG";
const MAX_LAUNCH_CONFIG_BYTES = 4096;

export type CanonicalLaunchExpectations = { runnerId: string; policySha256: string };

/**
 * Reads the exact same ORIA_OPENHANDS_LAUNCH_CONFIG + launchConfigSchema
 * model-emission-launch-gate.ts's defaultLoadLaunchConfig() reads — never a
 * second, independently-configured policy value. Re-read on every call,
 * never cached, so a changed policy is reflected on the next read.
 */
export function readCanonicalLaunchExpectations(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CanonicalLaunchExpectations | null {
  const raw = env[LAUNCH_CONFIG_ENV_VAR];
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_LAUNCH_CONFIG_BYTES) return null;
  try {
    const parsed = launchConfigSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || !parsed.data.providerProfile) return null;
    return { runnerId: parsed.data.runnerId, policySha256: parsed.data.providerProfile.policySha256 };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read-side: the explicit, approved consumption binding
// ---------------------------------------------------------------------------

export const CONNECTION_EVIDENCE_BINDING_ENV_VAR = "ORIA_OPENHANDS_CONNECTION_EVIDENCE_BINDING";
const MAX_BINDING_BYTES = 4096;
/** Pilot ceiling: this is a hard upper bound on operator configuration, not a
 * recommendation. Document and configure a much shorter value (seconds, not
 * hours) — a persisted row is never a substitute for the executor's own
 * fresh ACP confirmation before a prompt. */
const MAX_EVIDENCE_AGE_MS = 60 * 60 * 1000;

export const connectionEvidenceBindingSchema = z.object({
  version: z.literal(1),
  workspaceId: idSchema,
  provider: z.literal(EVIDENCE_PROVIDER_ID),
  runnerId: idSchema,
  container: containerSchema,
  approval: z.object({
    status: z.literal("approved"),
    approvalReference: z.string().trim().min(8).max(2000),
  }).strict(),
  maxEvidenceAgeMs: z.number().int().positive().max(MAX_EVIDENCE_AGE_MS),
}).strict();
export type ConnectionEvidenceBinding = z.infer<typeof connectionEvidenceBindingSchema>;

/** Re-read on every call, never cached. */
export function loadConnectionEvidenceBinding(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ConnectionEvidenceBinding | null {
  const raw = env[CONNECTION_EVIDENCE_BINDING_ENV_VAR];
  if (!raw || Buffer.byteLength(raw, "utf8") > MAX_BINDING_BYTES) return null;
  try {
    const parsed = connectionEvidenceBindingSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The persisted row itself
// ---------------------------------------------------------------------------

const evidenceRowSchema = z.object({
  workspaceId: idSchema,
  providerId: z.literal(EVIDENCE_PROVIDER_ID),
  runnerId: idSchema,
  container: containerSchema,
  contractVersion: z.literal(1),
  /** The canonical launch policy digest in effect when this row was
   * recorded — compared against the LIVE digest on every read, never only
   * against the binding, so a changed policy invalidates existing rows
   * without requiring a binding update. */
  policySha256: hashSchema,
  connectionState: z.string().refine(isConnectionState),
  source: z.string().refine(isEvidenceSource),
  accountId: idSchema.optional(),
  evidence: z.array(z.string().max(200)).max(10),
  requiredAction: z.string().max(400).optional(),
  checkedAtIso: isoTimestamp,
  recordedAtIso: isoTimestamp,
  recordedBy: idSchema,
}).strict();

function mapRowFromDatabase(data: Record<string, unknown>): unknown {
  return {
    workspaceId: data.workspace_id,
    providerId: data.provider_id,
    runnerId: data.runner_id,
    container: data.container,
    contractVersion: data.contract_version,
    policySha256: data.policy_sha256,
    connectionState: data.connection_state,
    source: data.source,
    accountId: data.account_id ?? undefined,
    evidence: data.evidence,
    requiredAction: data.required_action ?? undefined,
    checkedAtIso: data.checked_at,
    recordedAtIso: data.recorded_at,
    recordedBy: data.recorded_by,
  };
}

// ---------------------------------------------------------------------------
// Read path — called from HQ's own process, including under a cloud marker
// ---------------------------------------------------------------------------

export type ConnectionEvidenceReadResult =
  | { status: "ok"; outcome: ProviderConnectionProbeOutcome }
  | { status: "policy_unavailable" }
  | { status: "unavailable" }
  | { status: "no_row" }
  | { status: "malformed_row" }
  | { status: "binding_mismatch" }
  | { status: "policy_mismatch" }
  | { status: "stale" }
  | { status: "not_connected" };

/**
 * Validates and refuses on every disqualifying condition in order: no
 * canonical launch policy resolvable, no Supabase client, no row, a
 * malformed row, a workspace/provider/runner/container mismatch against the
 * approved binding, a policy digest or runner mismatch against the LIVE
 * canonical launch config, a future-dated or aged-out checkedAtIso, or a row
 * whose own state is not a fully attested "connected". Always queries fresh
 * — no module-level cache — so two calls in the same process (the gate's
 * initial discovery and its pre-CAS recheck) can observe a genuine change,
 * such as revocation, between them.
 */
export async function readRunnerConnectionEvidence(
  binding: ConnectionEvidenceBinding,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    readCanonical?: (env: Readonly<Record<string, string | undefined>>) => CanonicalLaunchExpectations | null;
  },
): Promise<ConnectionEvidenceReadResult> {
  const env = options?.env ?? process.env;
  const now = options?.now ?? Date.now;

  const canonical = (options?.readCanonical ?? readCanonicalLaunchExpectations)(env);
  if (!canonical) return { status: "policy_unavailable" };
  // The approved consumption binding itself no longer names the runner the
  // live launch config approves — refuse before even querying the store.
  if (canonical.runnerId !== binding.runnerId) return { status: "policy_mismatch" };

  let client;
  try {
    client = createOptionalSupabaseAdminClient();
  } catch {
    return { status: "unavailable" };
  }
  if (!client) return { status: "unavailable" };

  let data: Record<string, unknown> | null;
  let error: unknown;
  try {
    const response = await client
      .from("provider_connection_evidence")
      .select("*")
      .eq("workspace_id", binding.workspaceId)
      .eq("provider_id", binding.provider)
      .maybeSingle();
    data = response.data as Record<string, unknown> | null;
    error = response.error;
  } catch {
    return { status: "unavailable" };
  }
  if (error) return { status: "unavailable" };
  if (!data) return { status: "no_row" };

  const parsed = evidenceRowSchema.safeParse(mapRowFromDatabase(data));
  if (!parsed.success) return { status: "malformed_row" };
  const row = parsed.data;

  if (
    row.workspaceId !== binding.workspaceId ||
    row.providerId !== binding.provider ||
    row.runnerId !== binding.runnerId ||
    row.container !== binding.container
  ) {
    return { status: "binding_mismatch" };
  }

  if (row.policySha256 !== canonical.policySha256) return { status: "policy_mismatch" };

  const checkedAtMs = Date.parse(row.checkedAtIso);
  const nowMs = now();
  if (!Number.isFinite(checkedAtMs) || checkedAtMs > nowMs || nowMs - checkedAtMs > binding.maxEvidenceAgeMs) {
    return { status: "stale" };
  }

  if (row.connectionState !== "connected" || row.source === "declared-capability" || !row.accountId) {
    return { status: "not_connected" };
  }

  return {
    status: "ok",
    outcome: {
      connectionState: "connected",
      source: row.source,
      accountId: row.accountId,
      evidence: row.evidence,
    },
  };
}

function describeEvidenceReadFailure(
  status: Exclude<ConnectionEvidenceReadResult["status"], "ok">,
  binding: ConnectionEvidenceBinding,
): string {
  switch (status) {
    case "policy_unavailable":
      return `${LAUNCH_CONFIG_ENV_VAR} is not resolvable — no canonical policy/runner digest to compare this binding against`;
    case "unavailable":
      return "persisted connection evidence store is unavailable — Supabase admin client not configured or unreachable";
    case "no_row":
      return `no persisted connection evidence recorded yet for ${binding.provider}/${binding.runnerId}/${binding.container} — run runner-connection-evidence-record.mjs on the runner-operator host`;
    case "malformed_row":
      return "persisted connection evidence row failed strict validation — treated as absent";
    case "binding_mismatch":
      return "persisted connection evidence does not match the approved workspace/provider/runner/container binding";
    case "policy_mismatch":
      return `the approved binding or its stored evidence no longer matches the canonical launch policy/runner for "${binding.runnerId}" — stale relative to policy, not only to time`;
    case "stale":
      return `persisted connection evidence is future-dated or older than the approved ${binding.maxEvidenceAgeMs}ms freshness bound`;
    case "not_connected":
      return "persisted connection evidence does not show a fully attested, evidence-grade \"connected\" state";
  }
}

// ---------------------------------------------------------------------------
// Write path (primitive) — operator-host only, never callable from HQ's own
// process. Accepts explicit, already-resolved fields; recordFromLiveRunnerProbe
// below is the orchestration layer that resolves them from a single probe run.
// ---------------------------------------------------------------------------

export type RecordableConnectionEvidence = {
  workspaceId: string;
  runnerId: string;
  container: string;
  policySha256: string;
  outcome: ProviderConnectionProbeOutcome;
  /** Captured by the caller BEFORE invoking the probe, never after — a
   * result must never carry a timestamp newer than the check it describes. */
  checkedAtIso: string;
  recordedBy: string;
};

export type RecordConnectionEvidenceResult = { status: "recorded" } | { status: "rejected"; reason: string };

// NOT .strict(): validates a SUBSET of RecordableConnectionEvidence's own
// fields against the full entry, which also carries `outcome`.
const recordableFieldsSchema = z.object({
  workspaceId: idSchema,
  runnerId: idSchema,
  container: containerSchema,
  policySha256: hashSchema,
  recordedBy: idSchema,
  checkedAtIso: isoTimestamp,
});

/**
 * Enforced by construction: refuses outside the same operator/non-cloud
 * environment the SSH probe itself requires (resolveRunnerProbeEnvironment,
 * imported unmodified); refuses a malformed identity or a future-dated
 * checkedAtIso; refuses an invalid outcome shape; refuses to persist a
 * "connected" claim lacking an attested accountId or an evidence-grade
 * source. Overwrites any prior row for (workspaceId, providerId) — this
 * always reflects the LATEST probe result, never a first-wins identity.
 */
export async function recordRunnerConnectionEvidence(
  entry: RecordableConnectionEvidence,
  options?: { env?: Readonly<Record<string, string | undefined>>; now?: () => number },
): Promise<RecordConnectionEvidenceResult> {
  const env = options?.env ?? process.env;
  const environment = resolveRunnerProbeEnvironment(env);
  if (!environment.allowed) {
    return { status: "rejected", reason: `evidence recording forbidden: ${environment.reason}` };
  }

  const fields = recordableFieldsSchema.safeParse(entry);
  if (!fields.success) {
    return { status: "rejected", reason: "invalid workspaceId/runnerId/container/policySha256/recordedBy/checkedAtIso" };
  }

  const outcome = entry.outcome;
  if (!isConnectionState(outcome?.connectionState) || !isEvidenceSource(outcome?.source)) {
    return { status: "rejected", reason: "invalid probe outcome shape" };
  }
  if (
    outcome.connectionState === "connected" &&
    (outcome.source === "declared-capability" || typeof outcome.accountId !== "string" || outcome.accountId.length === 0)
  ) {
    return {
      status: "rejected",
      reason: "refusing to persist a connected outcome without an attested accountId and evidence-grade source",
    };
  }

  const checkedAtMs = Date.parse(entry.checkedAtIso);
  const nowMs = (options?.now ?? Date.now)();
  if (!Number.isFinite(checkedAtMs) || checkedAtMs > nowMs) {
    return { status: "rejected", reason: "checkedAtIso must be a valid, non-future timestamp" };
  }

  // A recorded row must satisfy the same bounds as the consuming probe.
  const validRow = evidenceRowSchema.safeParse({
    ...fields.data, providerId: EVIDENCE_PROVIDER_ID, contractVersion: 1,
    connectionState: outcome.connectionState, source: outcome.source,
    accountId: outcome.accountId, evidence: outcome.evidence,
    requiredAction: outcome.requiredAction, recordedAtIso: new Date(nowMs).toISOString(),
  });
  if (!validRow.success) return { status: "rejected", reason: "invalid persisted evidence fields" };

  let client;
  try {
    client = createOptionalSupabaseAdminClient();
  } catch {
    return { status: "rejected", reason: "evidence persistence unavailable" };
  }
  if (!client) return { status: "rejected", reason: "evidence persistence unavailable" };

  const row = {
    workspace_id: entry.workspaceId,
    provider_id: EVIDENCE_PROVIDER_ID,
    runner_id: entry.runnerId,
    container: entry.container,
    contract_version: 1,
    policy_sha256: entry.policySha256,
    connection_state: outcome.connectionState,
    source: outcome.source,
    account_id: outcome.accountId ?? null,
    evidence: Array.isArray(outcome.evidence) ? outcome.evidence.slice(0, 10).map(String) : [],
    required_action: outcome.requiredAction ?? null,
    checked_at: entry.checkedAtIso,
    recorded_at: new Date(nowMs).toISOString(),
    recorded_by: entry.recordedBy,
  };

  try {
    const { error } = await client
      .from("provider_connection_evidence")
      .upsert(row, { onConflict: "workspace_id,provider_id" });
    if (error) return { status: "rejected", reason: "evidence persistence failed" };
  } catch {
    return { status: "rejected", reason: "evidence persistence failed" };
  }
  return { status: "recorded" };
}

// ---------------------------------------------------------------------------
// Write path (orchestration) — the one function the operator-host script
// calls. Owns "one binding read, one probe call, one record": the SSH
// binding is read exactly once and the runner/probe are built from that same
// object, so a binding edited mid-run cannot make the recorded container
// disagree with the one actually probed. checkedAtIso is captured before the
// probe runs. runnerId and policySha256 come from the canonical launch
// config, never a free operator-typed argument.
// ---------------------------------------------------------------------------

export type RecordFromLiveProbeResult = RecordConnectionEvidenceResult | { status: "rejected"; reason: string };

export async function recordFromLiveRunnerProbe(
  workspaceId: string,
  recordedBy: string,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    readCanonical?: (env: Readonly<Record<string, string | undefined>>) => CanonicalLaunchExpectations | null;
    readBinding?: (workspaceId: string, env: Readonly<Record<string, string | undefined>>) => Promise<RunnerProbeBinding | null>;
    createProbe?: (binding: RunnerProbeBinding, env: Readonly<Record<string, string | undefined>>) => ProviderConnectionProbe;
  },
): Promise<RecordFromLiveProbeResult> {
  const env = options?.env ?? process.env;
  const now = options?.now ?? Date.now;

  const canonical = (options?.readCanonical ?? readCanonicalLaunchExpectations)(env);
  if (!canonical) {
    return { status: "rejected", reason: `${LAUNCH_CONFIG_ENV_VAR} is not resolvable on this host — no canonical runner/policy to bind this proof to` };
  }

  const binding = await (options?.readBinding ?? readRunnerProbeBinding)(workspaceId, env);
  if (!binding) {
    return { status: "rejected", reason: "no approved SSH operator binding for this workspace/environment" };
  }

  const probe = (options?.createProbe ?? defaultProbeFromBinding)(binding, env);
  const checkedAtIso = new Date(now()).toISOString();
  const outcome = await probe(EVIDENCE_PROVIDER, []);

  return recordRunnerConnectionEvidence(
    {
      workspaceId,
      runnerId: canonical.runnerId,
      container: binding.container,
      policySha256: canonical.policySha256,
      outcome,
      checkedAtIso,
      recordedBy,
    },
    { env, now },
  );
}

function defaultProbeFromBinding(
  binding: RunnerProbeBinding,
  env: Readonly<Record<string, string | undefined>>,
): ProviderConnectionProbe {
  const runner = createRunnerSshCommandRunner(binding.approval, {
    env: { ...env, [RUNNER_SSH_HOST_ENV_VAR]: binding.sshHost, [RUNNER_SSH_IDENTITY_FILE_ENV_VAR]: binding.sshIdentityFile },
    container: binding.container,
  });
  return createRunnerClaudeCliConnectionProbe(runner, { workspaceId: binding.workspaceId });
}

// ---------------------------------------------------------------------------
// The ProviderConnectionProbe — the only thing model-emission-launch-gate.ts
// consumes from this module
// ---------------------------------------------------------------------------

export function createPersistedRunnerConnectionProbe(
  workspaceId: string,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    now?: () => number;
    loadBinding?: (env: Readonly<Record<string, string | undefined>>) => ConnectionEvidenceBinding | null;
    read?: (
      binding: ConnectionEvidenceBinding,
      opts?: { env?: Readonly<Record<string, string | undefined>>; now?: () => number },
    ) => Promise<ConnectionEvidenceReadResult>;
  },
): ProviderConnectionProbe {
  return async (provider: ModelProviderDescriptor) => {
    if (provider.id !== EVIDENCE_PROVIDER_ID) {
      return {
        connectionState: "unknown",
        source: "declared-capability",
        requiredAction: `this probe only checks "${EVIDENCE_PROVIDER_ID}" — provider "${provider.id}" needs its own probe`,
        evidence: [],
      };
    }
    const env = options?.env ?? process.env;
    const binding = (options?.loadBinding ?? loadConnectionEvidenceBinding)(env);
    if (!binding || binding.workspaceId !== workspaceId) {
      return {
        connectionState: "unknown",
        source: "declared-capability",
        requiredAction:
          `no approved persisted-evidence consumption binding configured for workspace "${workspaceId}" — set ${CONNECTION_EVIDENCE_BINDING_ENV_VAR}`,
        evidence: [],
      };
    }
    const result = await (options?.read ?? readRunnerConnectionEvidence)(binding, { env, now: options?.now });
    if (result.status === "ok") return result.outcome;
    return {
      connectionState: "unknown",
      source: "declared-capability",
      requiredAction: describeEvidenceReadFailure(result.status, binding),
      evidence: [],
    };
  };
}
