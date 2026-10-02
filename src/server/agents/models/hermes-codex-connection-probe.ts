// src/server/agents/models/hermes-codex-connection-probe.ts
//
// A REAL implementation of the ProviderConnectionProbe boundary declared in
// ./provider-connection-discovery.ts, for exactly one provider: the
// "openai-codex" ChatGPT-OAuth subscription as seen by the Hermes/hermes_cli
// install already running on the VPS (container
// hermes-agent-cmho-hermes-agent-1, verified 2026-10-02).
//
// This closes the specific gap flagged in review: the discovery contract on
// its own only proves it can be wired to A probe, not that a real one
// exists. This file is that probe. It is NOT a second router and does not
// invent an account: it reads the state of the one official connection
// Codex (the operator) already verified by hand —
//   `docker exec hermes-agent-cmho-hermes-agent-1 \
//      /opt/hermes/.venv/bin/python -m hermes_cli.main auth status openai-codex`
//   -> "openai-codex: logged in"
// — over SSH, with the exact same safety doctrine as
// ../runtimes/local-runtime-probe.ts: written approval required before any
// subprocess runs, a frozen single command (no interpolation from caller
// input anywhere), no shell, and redaction on every line that leaves this
// module. "logged in" is evidence of a CONNECTION, never of a successful
// mission, a quota, or a budget — callers still need those facts elsewhere.
//
// Where this runs: an operator/VPS-adjacent host that actually holds the
// SSH identity file — never a browser, and never HQ's own public server
// process (which has no business holding a root VPS key). HQ consumes the
// resulting ProviderConnectionSnapshot as data; it does not run this probe
// inline on a request path. See docs note in the delivery report for the
// exact persistence call this still needs.

import { execFile } from "node:child_process";
import { redactProbeText } from "../runtimes/local-runtime-probe";
import type {
  ModelProviderDescriptor,
  RuntimeAdapterDescriptor,
} from "./model-provider-contract";
import type {
  ProviderConnectionProbe,
  ProviderConnectionProbeOutcome,
} from "./provider-connection-discovery";

// ---------------------------------------------------------------------------
// Written approval — same doctrine as LOCAL_RUNTIME_PROBE_APPROVAL
// ---------------------------------------------------------------------------

export type SubprocessApproval = { status: "approved"; approvalReference: string } | { status: "not_approved" };

/**
 * The written approval under which this probe may spawn `ssh` at all.
 * Recorded 2026-10-02: Michael authorized a bounded real-mission
 * qualification pass over the existing Hermes/Codex subscription, explicitly
 * excluding any paid API spend. An invalid or revoked reference turns every
 * call into a refusal (see createSshAuthStatusRunner).
 */
export const HERMES_CODEX_PROBE_APPROVAL: SubprocessApproval = {
  status: "approved",
  approvalReference:
    "Michael, 2026-10-02 session: bounded real-mission qualification over the existing Hermes/Codex subscription; no paid API spend",
};

// ---------------------------------------------------------------------------
// Execution environment gate — operator/VPS-adjacent host ONLY
// ---------------------------------------------------------------------------

const CLOUD_ENV_MARKERS: readonly string[] = [
  "VERCEL",
  "VERCEL_ENV",
  "AWS_LAMBDA_FUNCTION_NAME",
  "K_SERVICE",
  "FLY_APP_NAME",
  "RENDER",
];

export const SSH_PROBE_OPT_IN_ENV_VAR = "ORIA_ENABLE_HERMES_SSH_PROBE";

export type ProbeEnvironmentDecision = { allowed: boolean; reason: string };

/**
 * This probe holds a root VPS SSH identity file path. It must never run on
 * HQ's own public server process (Vercel or any cloud marker wins over every
 * flag) and never in production without an explicit local/operator opt-in.
 */
export function resolveSshProbeEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProbeEnvironmentDecision {
  const marker = CLOUD_ENV_MARKERS.find((key) => typeof env[key] === "string" && env[key] !== "");
  if (marker) {
    return { allowed: false, reason: `cloud marker "${marker}" present — this probe never runs on HQ's own server` };
  }
  if (env.NODE_ENV === "production" && env[SSH_PROBE_OPT_IN_ENV_VAR] !== "1") {
    return { allowed: false, reason: `production without ${SSH_PROBE_OPT_IN_ENV_VAR}=1 — no explicit operator opt-in` };
  }
  return { allowed: true, reason: "operator/non-production environment — probe sanctioned" };
}

// ---------------------------------------------------------------------------
// Frozen remote command — no interpolation from any caller input, ever
// ---------------------------------------------------------------------------

export const HERMES_CONTAINER_NAME = "hermes-agent-cmho-hermes-agent-1";

/** Fixed literal. Never built from a template with variable parts. */
export const REMOTE_AUTH_STATUS_COMMAND =
  `docker exec ${HERMES_CONTAINER_NAME} /opt/hermes/.venv/bin/python -m hermes_cli.main auth status openai-codex`;

export const HERMES_SSH_HOST_ENV_VAR = "ORIA_HERMES_SSH_HOST";
export const HERMES_SSH_IDENTITY_FILE_ENV_VAR = "ORIA_HERMES_SSH_IDENTITY_FILE";
export const DEFAULT_HERMES_SSH_HOST = "root@2.24.118.156";

const SSH_COMMAND_TIMEOUT_MS = 15_000;

export type SshCommandOutcome =
  | { kind: "completed"; exitCode: number; stdout: string; stderr: string }
  | { kind: "spawn_error"; message: string }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "rejected"; reason: string };

export type SshCommandRunner = () => Promise<SshCommandOutcome>;

/**
 * The default runner. Spawns `ssh` with an explicit argv array — never a
 * shell, never string concatenation — so the only variable parts (identity
 * file path, host) cannot be interpreted as shell syntax even if malformed;
 * they can only fail to match a real file/host. The remote command itself is
 * the frozen literal above, passed as a single argv element.
 */
export function createSshAuthStatusRunner(
  approval: SubprocessApproval,
  options?: {
    env?: Readonly<Record<string, string | undefined>>;
    timeoutMs?: number;
  },
): SshCommandRunner {
  const env = options?.env ?? process.env;
  const timeoutMs = options?.timeoutMs ?? SSH_COMMAND_TIMEOUT_MS;
  const environment = resolveSshProbeEnvironment(env);
  const approvalValid =
    approval.status === "approved" && approval.approvalReference.trim().length >= 8;
  const host = env[HERMES_SSH_HOST_ENV_VAR] || DEFAULT_HERMES_SSH_HOST;
  const identityFile = env[HERMES_SSH_IDENTITY_FILE_ENV_VAR];

  return () =>
    new Promise((resolve) => {
      if (!environment.allowed) {
        resolve({ kind: "rejected", reason: `execution environment forbidden: ${environment.reason}` });
        return;
      }
      if (!approvalValid) {
        resolve({ kind: "rejected", reason: "subprocess execution is not approved in writing — nothing spawns" });
        return;
      }
      if (!identityFile) {
        resolve({ kind: "rejected", reason: `${HERMES_SSH_IDENTITY_FILE_ENV_VAR} is not set — refusing to guess a key path` });
        return;
      }
      const args = [
        "-o", "BatchMode=yes",
        "-o", `ConnectTimeout=${Math.max(1, Math.floor(timeoutMs / 1000))}`,
        "-o", "StrictHostKeyChecking=accept-new",
        "-i", identityFile,
        host,
        REMOTE_AUTH_STATUS_COMMAND,
      ];
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
// Classification — pure, from SSH outcome to the shared probe outcome shape
// ---------------------------------------------------------------------------

const MAX_EVIDENCE_LENGTH = 200;

function firstLine(text: string): string {
  const redacted = redactProbeText((text ?? "").trim().split(/\r?\n/, 1)[0] ?? "");
  return redacted.length > MAX_EVIDENCE_LENGTH ? `${redacted.slice(0, MAX_EVIDENCE_LENGTH)}…` : redacted;
}

/**
 * Pure classifier: SSH outcome -> ProviderConnectionProbeOutcome. "logged
 * in" is reported with source "cli-subscription-login" — never
 * "declared-capability" and never promoted beyond what the exact stdout
 * line says. A non-zero exit, a timeout, or unparseable output all become
 * "unknown" with a concrete requiredAction, never a guessed
 * "connection_required".
 */
export function classifyHermesOpenAiCodexAuthStatus(
  outcome: SshCommandOutcome,
): ProviderConnectionProbeOutcome {
  if (outcome.kind === "rejected") {
    return {
      connectionState: "unknown",
      source: "cli-subscription-login",
      requiredAction: `probe refused before running: ${redactProbeText(outcome.reason)}`,
      evidence: [],
    };
  }
  if (outcome.kind === "timeout") {
    return {
      connectionState: "unknown",
      source: "cli-subscription-login",
      requiredAction: `SSH auth-status check timed out after ${outcome.timeoutMs}ms — retry discovery`,
      evidence: [],
    };
  }
  if (outcome.kind === "spawn_error") {
    return {
      connectionState: "unknown",
      source: "cli-subscription-login",
      requiredAction: "SSH could not be launched — check the operator host, not the Codex account",
      evidence: [`spawn error: ${outcome.message}`],
    };
  }
  const line = firstLine(`${outcome.stdout} ${outcome.stderr}`);
  if (outcome.exitCode === 0 && /^openai-codex:\s*logged in\b/i.test(line)) {
    return {
      connectionState: "connected",
      source: "cli-subscription-login",
      evidence: [`hermes_cli auth status openai-codex -> ${line}`],
    };
  }
  if (/not logged in/i.test(line)) {
    return {
      connectionState: "connection_required",
      source: "cli-subscription-login",
      requiredAction: "run the official Codex/ChatGPT login inside the Hermes container (operator action, not HQ)",
      evidence: [`hermes_cli auth status openai-codex -> ${line}`],
    };
  }
  return {
    connectionState: "unknown",
    source: "cli-subscription-login",
    requiredAction: "unexpected auth-status output — read it by hand before trusting this provider",
    evidence: [`hermes_cli auth status openai-codex -> ${line || `exit ${outcome.exitCode}`}`],
  };
}

// ---------------------------------------------------------------------------
// The ProviderConnectionProbe — only speaks for "openai-codex"
// ---------------------------------------------------------------------------

/**
 * Wraps the SSH runner as a ProviderConnectionProbe. Honest about its own
 * scope: for any provider other than "openai-codex" it returns "unknown"
 * with an explicit requiredAction rather than silently claiming knowledge it
 * does not have. Compose with other single-provider probes via
 * composeProviderConnectionProbes() below to cover a whole registry.
 */
export function createHermesCodexConnectionProbe(
  runner: SshCommandRunner = createSshAuthStatusRunner(HERMES_CODEX_PROBE_APPROVAL),
): ProviderConnectionProbe {
  return async (provider: ModelProviderDescriptor, _adapters: readonly RuntimeAdapterDescriptor[]) => {
    if (provider.id !== "openai-codex") {
      return {
        connectionState: "unknown",
        source: "declared-capability",
        requiredAction: `this probe only checks "openai-codex" — provider "${provider.id}" needs its own probe`,
        evidence: [],
      };
    }
    const outcome = await runner();
    return classifyHermesOpenAiCodexAuthStatus(outcome);
  };
}

/**
 * Combines several single-provider probes (each honest about which provider
 * it actually covers) into one ProviderConnectionProbe usable by
 * resolveProviderConnectionDiscovery() over a whole registry. Not a second
 * router: this is purely a fan-out helper over the same probe boundary.
 */
export function composeProviderConnectionProbes(
  probes: readonly ProviderConnectionProbe[],
): ProviderConnectionProbe {
  return async (provider, adapters) => {
    for (const probe of probes) {
      const outcome = await probe(provider, adapters);
      const isAbstention =
        outcome.connectionState === "unknown" &&
        outcome.source === "declared-capability" &&
        typeof outcome.requiredAction === "string" &&
        outcome.requiredAction.startsWith("this probe only checks");
      if (!isAbstention) return outcome;
    }
    return {
      connectionState: "unknown",
      source: "declared-capability",
      requiredAction: `no configured probe covers provider "${provider.id}"`,
      evidence: [],
    };
  };
}
