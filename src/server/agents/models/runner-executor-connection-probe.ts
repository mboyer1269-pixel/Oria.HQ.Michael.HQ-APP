// src/server/agents/models/runner-executor-connection-probe.ts
//
// A REAL ProviderConnectionProbe boundary implementation (see
// ./provider-connection-discovery.ts) for the OpenHands RUNNER HOST's own
// executor accounts — never Michael's laptop (../runtimes/local-runtime-probe.ts)
// and never Hermes (./hermes-codex-connection-probe.ts, which checks the
// entirely unrelated "openai-codex" account over SSH to a different host).
// This closes the exact gap model-emission-launch-gate.ts's own header names:
// "No live probe exists yet for the 'claude' executor account... that would
// need to run on the OpenHands runner host, not Michael's laptop and not the
// Hermes VPS."
//
// Doctrine, unconditional, enforced by construction below — not merely
// documented:
//   - Presence of a credentials file (auth.json or otherwise) is NEVER read
//     and NEVER treated as proof of a valid connection. The only evidence
//     this module accepts is the CLI's own non-interactive status command
//     actually running and actually answering — the identical command
//     Command Tower already trusts locally, reused unmodified via
//     classifyClaudeCodeProbe. A file existing on disk proves nothing about
//     whether its token is valid, expired, or for the right account; this
//     module only reads the explicit non-secret operator configuration file.
//   - No approval, host or account is built in. Operator configuration binds
//     written approval, SSH target and Docker container to one workspace.
//     Absent, revoked or malformed configuration remains closed. The file is
//     re-read on each probe, including the launch gate's final recheck.
//   - Only "claude-code-cli" has a real classifier reused here
//     (classifyClaudeCodeProbe, unmodified). "codex-acp-cli" has no
//     non-interactive login-status surface exposed by the candidate runtime
//     yet (its ACP wrapper only offers an interactive `login` and the full
//     ACP stdio protocol, neither of which this probe may use — login would
//     be exactly the forbidden interactive authentication, and speaking ACP
//     JSON-RPC here would duplicate the protocol-qualification scripts that
//     already live next to that candidate image). It stays an honest
//     "unknown" with that exact prerequisite named.
//   - accountId (the attested-account axis — see
//     provider-connection-discovery.ts) is still NEVER derived from
//     orgId, a profile id, or the bare `loggedIn` boolean, for either
//     provider. classifyClaudeCodeProbe's own auth JSON exposes `orgId`,
//     but that identifies the ORGANIZATION, not the specific user
//     connected under it — an earlier version of this code hashed orgId
//     into accountId anyway; caught in independent review before
//     activation and reverted (hashing an org-scoped value does not turn
//     it into a user-scoped one). For "claude-code-cli" ONLY, when the
//     classifier reports "ready" and a workspace is bound at construction
//     (see `workspaceId` below), accountId is now populated from `email`
//     — the one field in that JSON that IS user-identifying — but never
//     as the raw value and never as a hash of it: a personal email is
//     low-entropy and a hash of it is dictionary/rainbow-table reversible,
//     unlike a high-entropy UUID. Instead `email` is handed, in memory,
//     straight to account-identity-repository.ts's resolveOpaqueAccountId,
//     which looks up (or creates) a random, server-persisted surrogate
//     UUID keyed by (provider, workspace, email) and returns only that —
//     the email itself is never logged, never placed in evidence, and
//     never returned to any caller. Two different emails under the same
//     org/profile/workspace resolve to two different surrogate ids,
//     closing the exact "shared org, different people" gap independent
//     review flagged (see this file's test for the two-user case). If the
//     auth response carries no `email`, no workspace was bound, or the
//     repository lookup itself fails (no persistence configured, a
//     transport error), accountId simply stays absent — the probe never
//     throws and never falls back to orgId/profile/loggedIn. For
//     "codex-acp-cli": its own official `codex doctor --json` ("Emit a
//     redacted machine-readable report") was inspected read-only and its
//     auth.credentials section reports presence-only booleans ("stored
//     agent identity", "stored ChatGPT tokens", etc. — all boolean-length
//     strings, never a value), and plain `codex login status` carries no
//     extra data at all. This provider has no safe, officially documented,
//     per-USER field today, so it keeps refusing explicitly rather than
//     fabricate one — never substituting an organization, profile, or
//     provider identity instead. Callers that require an attested
//     accountId must still refuse explicitly on its absence
//     (model-emission-launch-gate.ts does).
//
// Pure where it can be: the classification step (classifyClaudeCodeProbe)
// is the same pure function local-runtime-probe.ts already uses; only the
// transport (SSH vs local execFile) is new here.

import "server-only";
import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { z } from "zod";
import {
  classifyClaudeCodeProbe,
  redactProbeText,
  type ProbeCommandOutcome,
  type ProbedRuntimeStatus,
} from "../runtimes/local-runtime-probe";
import { resolveOpaqueAccountId, type AccountIdentityKey } from "./account-identity-repository";
import type {
  ModelProviderDescriptor,
  RuntimeAdapterDescriptor,
} from "./model-provider-contract";
import type {
  ConnectionEvidenceSource,
  ConnectionState,
  ProviderConnectionProbe,
  ProviderConnectionProbeOutcome,
} from "./provider-connection-discovery";

// ---------------------------------------------------------------------------
// Written approval — same doctrine as local-runtime-probe.ts and
// hermes-codex-connection-probe.ts, but with NO default "approved" value.
// ---------------------------------------------------------------------------

export type SubprocessApproval =
  | { status: "approved"; approvalReference: string }
  | { status: "not_approved" };

/** No built-in approval. Only a validated operator binding can replace it. */
export const RUNNER_EXECUTOR_PROBE_APPROVAL: SubprocessApproval = { status: "not_approved" };

// ---------------------------------------------------------------------------
// Execution environment gate — operator/runner-adjacent host ONLY
// ---------------------------------------------------------------------------

const CLOUD_ENV_MARKERS: readonly string[] = [
  "VERCEL",
  "VERCEL_ENV",
  "AWS_LAMBDA_FUNCTION_NAME",
  "K_SERVICE",
  "FLY_APP_NAME",
  "RENDER",
];

export const RUNNER_PROBE_OPT_IN_ENV_VAR = "ORIA_ENABLE_OPENHANDS_RUNNER_PROBE";

export type ProbeEnvironmentDecision = { allowed: boolean; reason: string };

/**
 * This probe would hold an SSH identity file path once one exists. It must
 * never run on HQ's own public server process (a cloud marker always wins)
 * and never in production without an explicit local/operator opt-in.
 */
export function resolveRunnerProbeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProbeEnvironmentDecision {
  const marker = CLOUD_ENV_MARKERS.find((key) => typeof env[key] === "string" && env[key] !== "");
  if (marker) {
    return { allowed: false, reason: `cloud marker "${marker}" present — this probe never runs on HQ's own server` };
  }
  if (env.NODE_ENV === "production" && env[RUNNER_PROBE_OPT_IN_ENV_VAR] !== "1") {
    return { allowed: false, reason: `production without ${RUNNER_PROBE_OPT_IN_ENV_VAR}=1 — no explicit operator opt-in` };
  }
  return { allowed: true, reason: "operator/non-production environment — probe sanctioned" };
}

// ---------------------------------------------------------------------------
// Transport — local execFile with strict SSH host verification; only frozen
// CLI status commands inside an explicitly configured Docker container.
// ---------------------------------------------------------------------------

export const RUNNER_SSH_HOST_ENV_VAR = "ORIA_OPENHANDS_RUNNER_SSH_HOST";
export const RUNNER_SSH_IDENTITY_FILE_ENV_VAR = "ORIA_OPENHANDS_RUNNER_SSH_IDENTITY_FILE";
// No default host: only the operator can name the qualified executor context.

const SSH_COMMAND_TIMEOUT_MS = 15_000;

/** Same outcome vocabulary as local-runtime-probe.ts's ProbeCommandOutcome;
 * "not_found" is never produced remotely (a missing remote binary surfaces
 * as a nonzero exit, handled by classifyClaudeCodeProbe's existing
 * "completed, exitCode !== 0" branch, same as any other remote failure). */
export type SshCommandOutcome = ProbeCommandOutcome;
export type SshCommandRunner = (remoteCommand: string) => Promise<SshCommandOutcome>;

/**
 * The default runner. Resolves to an explicit `rejected` outcome — naming
 * exactly which prerequisite is missing — until all four are true: a
 * sanctioned environment, a real written approval, a configured SSH host,
 * and a configured identity file. No step is skipped silently.
 */
export function createRunnerSshCommandRunner(
  approval: SubprocessApproval,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    timeoutMs?: number;
    container?: string;
  },
): SshCommandRunner {
  const env = options?.env ?? process.env;
  const timeoutMs = options?.timeoutMs ?? SSH_COMMAND_TIMEOUT_MS;
  const environment = resolveRunnerProbeEnvironment(env);
  const approvalValid = approval.status === "approved" && approval.approvalReference.trim().length >= 8;
  const host = env[RUNNER_SSH_HOST_ENV_VAR];
  const identityFile = env[RUNNER_SSH_IDENTITY_FILE_ENV_VAR];

  return (remoteCommand) =>
    new Promise((resolve) => {
      if (!environment.allowed) {
        resolve({ kind: "rejected", reason: `execution environment forbidden: ${environment.reason}` });
        return;
      }
      if (!approvalValid) {
        resolve({ kind: "rejected", reason: "subprocess execution is not approved in writing — nothing spawns" });
        return;
      }
      if (!host) {
        resolve({ kind: "rejected", reason: `${RUNNER_SSH_HOST_ENV_VAR} is not set — no OpenHands runner host is configured` });
        return;
      }
      if (!identityFile) {
        resolve({ kind: "rejected", reason: `${RUNNER_SSH_IDENTITY_FILE_ENV_VAR} is not set — refusing to guess a key path` });
        return;
      }
      const args = buildRunnerSshInvocation(host, identityFile, options?.container, remoteCommand, timeoutMs);
      if (!args) {
        resolve({ kind: "rejected", reason: "invalid runner binding or command outside the frozen probe allowlist" });
        return;
      }
      try {
        execFile(
          "ssh",
          args,
          { timeout: timeoutMs, windowsHide: true, maxBuffer: 65_536, encoding: "utf8" },
          (error, stdout, stderr) => {
            if (!error) {
              resolve({ kind: "completed", exitCode: 0, stdout, stderr });
              return;
            }
            const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
            if (err.killed === true || err.signal === "SIGTERM" || err.signal === "SIGKILL") {
              resolve({ kind: "timeout", timeoutMs });
              return;
            }
            if (typeof err.code === "number") {
              resolve({ kind: "completed", exitCode: err.code, stdout: stdout ?? "", stderr: stderr ?? "" });
              return;
            }
            resolve({ kind: "spawn_error", message: redactProbeText(err.message ?? String(err.code ?? "spawn failed")) });
          },
        );
      } catch (error) {
        resolve({ kind: "spawn_error", message: redactProbeText(error instanceof Error ? error.message : String(error)) });
      }
    });
}

// ---------------------------------------------------------------------------
// Frozen remote commands for "claude-code-cli" — identical literals to
// local-runtime-probe.ts's PROBE_COMMAND_ALLOWLIST, so classifyClaudeCodeProbe
// reads exactly the output shape it already expects.
// ---------------------------------------------------------------------------

export const RUNNER_CLAUDE_VERSION_COMMAND = "claude --version";
export const RUNNER_CLAUDE_AUTH_STATUS_COMMAND = "claude auth status --json";

const sshHostSchema = z.string().max(255).regex(/^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*@)?[A-Za-z0-9][A-Za-z0-9.-]*$/);
const identityPathSchema = z.string().min(1).max(4096).refine((value) => isAbsolute(value) && !/[\r\n\0]/.test(value));
const containerSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const bindingSchema = z.object({
  version: z.literal(1),
  workspaceId: z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/),
  provider: z.literal("claude-code-cli"),
  approval: z.object({
    status: z.literal("approved"),
    approvalReference: z.string().trim().min(8).max(2000),
  }).strict(),
  sshHost: sshHostSchema,
  sshIdentityFile: identityPathSchema,
  container: containerSchema,
}).strict();
export type RunnerProbeBinding = z.infer<typeof bindingSchema>;

/** Fixed remote tokens only: SSH invokes a remote shell, so container and host
 * must be validated even though the local child process uses no shell. */
export function buildRunnerSshInvocation(
  host: string,
  identityFile: string,
  container: string | undefined,
  command: string,
  timeoutMs = SSH_COMMAND_TIMEOUT_MS,
): string[] | null {
  if (!sshHostSchema.safeParse(host).success || !identityPathSchema.safeParse(identityFile).success ||
      !containerSchema.safeParse(container).success || !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      (command !== RUNNER_CLAUDE_VERSION_COMMAND && command !== RUNNER_CLAUDE_AUTH_STATUS_COMMAND)) return null;
  return [
    "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
    "-o", `ConnectTimeout=${Math.max(1, Math.floor(timeoutMs / 1000))}`,
    "-o", "StrictHostKeyChecking=yes", "-i", identityFile,
    host, `docker exec ${container} /usr/local/bin/claude-agent-acp --cli ${command === RUNNER_CLAUDE_VERSION_COMMAND ? "--version" : "auth status --json"}`,
  ];
}

/** Configuration contains references, never credential contents. No auth files
 * are opened. A bounded read and strict schema reject malformed operator input. */
export async function readRunnerProbeBinding(
  workspaceId: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<RunnerProbeBinding | null> {
  const configPath = env.ORIA_OPENHANDS_RUNNER_PROBE_CONFIG_FILE;
  if (!configPath || !isAbsolute(configPath) || !resolveRunnerProbeEnvironment(env).allowed) return null;
  try {
    const file = await open(configPath, "r");
    try {
      if (!(await file.stat()).isFile()) return null;
      const buffer = Buffer.alloc(16_385);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 16_384) return null;
      const parsed = bindingSchema.safeParse(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
      return parsed.success && parsed.data.workspaceId === workspaceId ? parsed.data : null;
    } finally { await file.close(); }
  } catch { return null; }
}

/** Uses the existing transport and identity resolver. The optional factory is a
 * test seam; production never accepts a runner or approval from a request body. */
export function createConfiguredRunnerConnectionProbe(
  workspaceId: string,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    runnerFactory?: (binding: RunnerProbeBinding) => SshCommandRunner;
  },
): ProviderConnectionProbe {
  return async (provider, adapters) => {
    const env = options?.env ?? process.env;
    const binding = await readRunnerProbeBinding(workspaceId, env);
    if (!binding) return {
      connectionState: "unknown", source: "declared-capability", evidence: [],
      requiredAction: "runner probe operator binding absent, unapproved, invalid, forbidden or workspace-mismatched",
    };
    const runner = options?.runnerFactory?.(binding) ?? createRunnerSshCommandRunner(binding.approval, {
      env: { ...env, [RUNNER_SSH_HOST_ENV_VAR]: binding.sshHost, [RUNNER_SSH_IDENTITY_FILE_ENV_VAR]: binding.sshIdentityFile },
      container: binding.container,
    });
    return createRunnerClaudeCliConnectionProbe(runner, { workspaceId })(provider, adapters);
  };
}


// ---------------------------------------------------------------------------
// Classification bridge — ProbedRuntimeStatus (local-runtime-probe.ts's
// vocabulary) -> ConnectionState (provider-connection-discovery.ts's
// vocabulary). "cli-subscription-login" is reported whenever the auth-status
// command actually ran and answered (ready or blocked alike — the source
// describes the KIND of evidence, not whether it was positive); anything
// that never produced a real answer (timeout, spawn failure, malformed
// output) stays "declared-capability", which isExecutionReady() already
// refuses as insufficient.
// ---------------------------------------------------------------------------

function toConnectionOutcome(
  status: ProbedRuntimeStatus,
  reason: string,
  evidence: readonly string[],
  accountId: string | undefined,
): ProviderConnectionProbeOutcome {
  const source: ConnectionEvidenceSource =
    status === "ready" || status === "blocked" ? "cli-subscription-login" : "declared-capability";
  if (status === "ready") {
    // accountId here is this file's OWN opaque resolution (see
    // resolveAttestedAccountId below), not anything classifyClaudeCodeProbe
    // itself returns (it never does — see this file's header). This bridge
    // still invents nothing of its own: never a profile/org/provider id,
    // never a bare loggedIn boolean, standing in for a real per-user
    // attestation; absent whenever the opaque resolution did not run or
    // did not succeed.
    return { connectionState: "connected", source, evidence, ...(accountId ? { accountId } : {}) };
  }
  const connectionState: ConnectionState = status === "blocked" ? "connection_required" : "unknown";
  return { connectionState, source, requiredAction: reason, evidence };
}

// ---------------------------------------------------------------------------
// Opaque account attestation — bridges the CLI's own `email` field (never
// logged, never placed in evidence) into account-identity-repository.ts's
// server-persisted surrogate UUID. See this file's header for the full
// doctrine; this is the only place that reads `email` out of the raw auth
// JSON, and it never does anything with the value except hand it straight
// to the resolver.
// ---------------------------------------------------------------------------

/**
 * Reads `email`, but ONLY from an actually-completed, zero-exit, valid-JSON
 * auth-status response that ALSO shows `authMethod: "claude.ai"` and does
 * not show an API-key provider mode. Newer CLI output carries
 * `apiProvider: "firstParty"`; the runner-qualified ACP bridge can also
 * return the same real account login with `subscriptionType` and no
 * `apiProvider` field. Both are accepted because the proof is still the
 * executor CLI's own response, not a provider/profile id. An explicit
 * non-first-party apiProvider is refused. classifyClaudeCodeProbe's own
 * "ready" status only requires `loggedIn === true`; it does not by itself
 * distinguish a subscription login from an API-key one. Without this check
 * here, an API-key session that happens to expose `email` would attest an
 * opaque accountId just as readily as a real subscription login — defeating
 * "mode API refusé" at this layer (the host layer would still catch it, but
 * this layer should not need to rely on that). Never throws; a
 * missing/malformed/non-matching field is `undefined`, same as a missing
 * email.
 */
function extractAttestableEmail(authOutcome: SshCommandOutcome): string | undefined {
  if (authOutcome.kind !== "completed" || authOutcome.exitCode !== 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(authOutcome.stdout.trim());
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (record.authMethod !== "claude.ai") return undefined;
  if (record.apiProvider !== undefined && record.apiProvider !== "firstParty") return undefined;
  if (record.apiProvider === undefined && typeof record.subscriptionType !== "string") return undefined;
  const email = record.email;
  return typeof email === "string" ? email : undefined;
}

export type AccountIdentityResolver = (key: AccountIdentityKey) => Promise<string>;

/**
 * Best-effort, never-throwing bridge to resolveOpaqueAccountId. Absence of
 * any of workspaceId/email, or a resolver failure (no persistence
 * configured, a transport error), all collapse to the SAME honest outcome:
 * no accountId. The caller (model-emission-launch-gate.ts) already refuses
 * explicitly on that absence — this function never guesses, never retries,
 * and never lets the lookup email escape into a thrown error.
 */
async function resolveAttestedAccountId(
  providerId: string,
  workspaceId: string | undefined,
  email: string | undefined,
  resolve: AccountIdentityResolver,
): Promise<string | undefined> {
  if (!workspaceId || !email) return undefined;
  try {
    return await resolve({ provider: providerId, workspaceId, email });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// The ProviderConnectionProbe — only speaks for "claude-code-cli"
// ---------------------------------------------------------------------------

const CODEX_ACP_CLI_REQUIRED_ACTION =
  "no non-interactive login-status command is exposed by the Codex ACP candidate runtime yet " +
  "(integrations/openhands-codex-runtime/ in Orchestrator is unbuilt and unqualified — see its RESULTS.md); " +
  "the official codex CLI's own `doctor --json` was inspected read-only and its auth section reports " +
  "presence-only booleans, never an account identity, and `login status` carries no extra data at all " +
  "— a real probe needs a stronger official surface before it can attest an account for this provider " +
  "without guessing from file presence";

/**
 * Wraps the SSH runner as a ProviderConnectionProbe scoped to the OpenHands
 * runner host's own "claude-code-cli" executor account. Honest about every
 * other provider: "codex-acp-cli" gets its own named, specific gap rather
 * than a generic refusal, and any unlisted provider id gets the same
 * abstention shape hermes-codex-connection-probe.ts uses, so this can be
 * composed with composeProviderConnectionProbes() if a second real probe is
 * ever added, without inventing a second router.
 *
 * `options.workspaceId` scopes the opaque account attestation (see the
 * header doctrine and resolveAttestedAccountId above) to the workspace the
 * caller is actually resolving connection discovery for — the
 * ProviderConnectionProbe contract itself is untouched (still just
 * provider+adapters), so the caller binds its own workspace when
 * constructing this probe rather than a second parameter being threaded
 * through every probe implementation. Omitting it keeps today's behavior:
 * connected, but never an attested accountId. `options.resolveAccountId`
 * defaults to the real resolveOpaqueAccountId and exists only so tests can
 * observe the exact key without a real persistence backend.
 */
export function createRunnerClaudeCliConnectionProbe(
  runner: SshCommandRunner = createRunnerSshCommandRunner(RUNNER_EXECUTOR_PROBE_APPROVAL),
  options?: {
    workspaceId?: string;
    resolveAccountId?: AccountIdentityResolver;
  },
): ProviderConnectionProbe {
  const workspaceId = options?.workspaceId;
  const resolveAccountId = options?.resolveAccountId ?? resolveOpaqueAccountId;
  return async (provider: ModelProviderDescriptor, _adapters: readonly RuntimeAdapterDescriptor[]) => {
    if (provider.id === "codex-acp-cli") {
      return {
        connectionState: "unknown",
        source: "declared-capability",
        requiredAction: CODEX_ACP_CLI_REQUIRED_ACTION,
        evidence: [],
      };
    }
    if (provider.id !== "claude-code-cli") {
      return {
        connectionState: "unknown",
        source: "declared-capability",
        requiredAction: `this probe only checks "claude-code-cli" — provider "${provider.id}" needs its own probe`,
        evidence: [],
      };
    }
    const probedAtIso = new Date().toISOString();
    const versionOutcome = await runner(RUNNER_CLAUDE_VERSION_COMMAND);
    const authOutcome = await runner(RUNNER_CLAUDE_AUTH_STATUS_COMMAND);
    const classified = classifyClaudeCodeProbe(versionOutcome, authOutcome, probedAtIso);
    const attestedAccountId =
      classified.status === "ready"
        ? await resolveAttestedAccountId(
            provider.id,
            workspaceId,
            extractAttestableEmail(authOutcome),
            resolveAccountId,
          )
        : undefined;
    return toConnectionOutcome(classified.status, classified.reason, classified.evidence, attestedAccountId);
  };
}
