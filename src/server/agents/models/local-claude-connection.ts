import "server-only";
import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { z } from "zod";
import type { OwnerAccess } from "@/server/auth/owner";
import {
  PROBE_COMMAND_ALLOWLIST, PROBE_COMMAND_TIMEOUT_MS, resolveProbeExecutionEnvironment,
  runProbeCommand, classifyClaudeCodeProbe, type ProbeCommandOutcome,
} from "../runtimes/local-runtime-probe";
import {
  createRunnerClaudeCliConnectionProbe, RUNNER_CLAUDE_VERSION_COMMAND, RUNNER_CLAUDE_AUTH_STATUS_COMMAND,
  type AccountIdentityResolver,
} from "./runner-executor-connection-probe";

const reference = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const uuid = z.uuid();
const operatorBindingSchema = z.object({
  version: z.literal(1), placement: z.literal("personal_local"),
  ownerActorId: uuid, workspaceId: reference, hostRef: reference,
  /** Operator-qualified native executable only. Never accepted from a browser request. */
  executablePath: z.string().min(1).max(4096).refine(value =>
    isAbsolute(value) && !/[\r\n\0]/.test(value) && !/\.(?:ps1|cmd|bat|sh|js|mjs|cjs|py)$/i.test(value)),
  approval: z.object({ status: z.literal("approved"), approvalReference: z.string().trim().min(8).max(2000) }).strict(),
}).strict();
export type LocalClaudeOperatorBinding = z.infer<typeof operatorBindingSchema>;
export type LocalClaudeConnectionContext = { access: OwnerAccess; workspaceId: string; hostRef: string };
export type LocalClaudeConnectionObservation = {
  status: "rejected" | "unavailable" | "connection_required" | "identity_unverifiable" | "observed";
  reason: "access_denied" | "invalid_context" | "invalid_binding" | "scope_mismatch"
    | "environment_forbidden" | "operator_opt_in_required" | "probe_unavailable"
    | "not_connected" | "account_not_attested" | "account_observed";
  placement: "personal_local";
  scope: { workspaceRef: string; ownerActorRef: string; hostRef: string } | null;
  accountRef: string | null;
  loginStatus: "not_checked" | "recognized" | "not_recognized" | "unknown";
  observedAtIso: string | null;
  hqTransport: "not_paired";
  enablesDispatch: false;
  confirmationReadiness: "not_verified";
  chatStatus: "unavailable";
  missionStatus: "not_verified";
};
export type NativeClaudeCommandRequest = {
  executablePath: string; args: readonly string[]; env: Readonly<Record<string, string>>; timeoutMs: number;
};
export type NativeClaudeCommandTransport = (request: NativeClaudeCommandRequest) => Promise<ProbeCommandOutcome>;
export type LocalClaudeConnectionDeps = {
  env?: Readonly<Record<string, string | undefined>>;
  transport?: NativeClaudeCommandTransport;
  resolveAccountId?: AccountIdentityResolver;
  now?: () => number;
};
export const LOCAL_CLAUDE_ATTESTATION_OPT_IN = "ORIA_ENABLE_LOCAL_CLAUDE_ATTESTATION";

/** Child-process-only environment. Never returned in an observation. */
export function sanitizeLocalClaudeEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const allowed = new Set(["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "USERPROFILE", "HOME", "APPDATA", "LOCALAPPDATA",
    "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "XDG_RUNTIME_DIR", "CLAUDE_CONFIG_DIR"]);
  return Object.fromEntries(Object.entries(env).filter(([key, value]) => typeof value === "string"
    && allowed.has(key.toUpperCase()) && !key.toUpperCase().includes("API_KEY"))) as Record<string, string>;
}

const nativeTransport: NativeClaudeCommandTransport = request => new Promise(resolve => {
  try {
    execFile(request.executablePath, [...request.args], { shell: false, windowsHide: true,
      env: { ...request.env, NODE_ENV: "production" }, timeout: request.timeoutMs, maxBuffer: 65_536, encoding: "utf8" },
    (error, stdout, stderr) => {
      if (!error) return resolve({ kind: "completed", exitCode: 0, stdout, stderr });
      const failure = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
      if (failure.killed || failure.signal) return resolve({ kind: "timeout", timeoutMs: request.timeoutMs });
      if (failure.code === "ENOENT") return resolve({ kind: "not_found" });
      if (typeof failure.code === "number") return resolve({ kind: "completed", exitCode: failure.code, stdout, stderr });
      resolve({ kind: "spawn_error", message: "native client unavailable" });
    });
  } catch { resolve({ kind: "spawn_error", message: "native client unavailable" }); }
});

function confirmsNativeSubscription(outcome: ProbeCommandOutcome): boolean {
  if (outcome.kind !== "completed" || outcome.exitCode !== 0) return false;
  try {
    const raw: unknown = JSON.parse(outcome.stdout);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const auth = raw as Record<string, unknown>;
    return auth.loggedIn === true && auth.authMethod === "claude.ai"
      && (auth.apiProvider === "firstParty" || (auth.apiProvider === undefined
        && typeof auth.subscriptionType === "string" && auth.subscriptionType.trim().length > 0));
  } catch { return false; }
}

/** Explicit operator call only; deliberately unwired to pages, APIs and background jobs.
 * The caller supplies requireOwnerAccess's real result and an operator-loaded binding.
 * hostRef names this local execution context, not a VPS runner or portable account grant.
 * Reuses the runner's subscription attestation with a different, strictly local transport.
 * Only the existing identity repository may resolve account UUIDs; no runner evidence is
 * written. A process-local identity fallback is not durable cross-host qualification.
 */
export async function observeLocalClaudeConnection(
  context: LocalClaudeConnectionContext,
  operatorBinding: LocalClaudeOperatorBinding,
  dependencies: LocalClaudeConnectionDeps = {},
): Promise<LocalClaudeConnectionObservation> {
  const base: LocalClaudeConnectionObservation = {
    status: "rejected", reason: "access_denied", placement: "personal_local", scope: null,
    accountRef: null, loginStatus: "not_checked", observedAtIso: null, hqTransport: "not_paired",
    enablesDispatch: false, confirmationReadiness: "not_verified",
    chatStatus: "unavailable", missionStatus: "not_verified",
  };
  if (context?.access?.status !== "authorized") return base;
  if (!uuid.safeParse(context.access.user?.id).success || !reference.safeParse(context.workspaceId).success
    || !reference.safeParse(context.hostRef).success) return { ...base, reason: "invalid_context" };
  const parsed = operatorBindingSchema.safeParse(operatorBinding);
  if (!parsed.success) return { ...base, reason: "invalid_binding" };
  const binding = parsed.data;
  if (binding.ownerActorId !== context.access.user.id || binding.workspaceId !== context.workspaceId || binding.hostRef !== context.hostRef) {
    return { ...base, reason: "scope_mismatch" };
  }
  const env = dependencies.env ?? process.env;
  if (!resolveProbeExecutionEnvironment(env).allowed) return { ...base, reason: "environment_forbidden" };
  if (env[LOCAL_CLAUDE_ATTESTATION_OPT_IN] !== "1") return { ...base, reason: "operator_opt_in_required" };
  const scope = { workspaceRef: context.workspaceId, ownerActorRef: context.access.user.id, hostRef: context.hostRef };
  try {
    const observedAtIso = new Date((dependencies.now ?? Date.now)()).toISOString();
    const childEnv = sanitizeLocalClaudeEnvironment(env);
    const transport = dependencies.transport ?? nativeTransport;
    const runLocal = async (commandId: "claude_version" | "claude_auth_status"): Promise<ProbeCommandOutcome> => {
      const allowed = PROBE_COMMAND_ALLOWLIST.find(entry => entry.id === commandId);
      if (!allowed) return { kind: "rejected", reason: "unsupported local command" };
      return runProbeCommand(allowed, entry => transport({ executablePath: binding.executablePath,
        args: [...entry.args], env: { ...childEnv }, timeoutMs: PROBE_COMMAND_TIMEOUT_MS }));
    };
    const version = await runLocal("claude_version");
    const auth = await runLocal("claude_auth_status");
    const classified = classifyClaudeCodeProbe(version, auth, observedAtIso);
    if (classified.status !== "ready") {
      return classified.status === "blocked"
        ? { ...base, status: "connection_required", reason: "not_connected", scope, loginStatus: "not_recognized", observedAtIso }
        : { ...base, status: "unavailable", reason: "probe_unavailable", scope, loginStatus: "unknown" };
    }
    const recognized = { ...base, scope, loginStatus: "recognized" as const, observedAtIso };
    // The old display classifier accepts loggedIn alone. Refuse API/unknown mode
    // before invoking the identity bridge or repository on this new local path.
    if (!confirmsNativeSubscription(auth)) return { ...recognized, status: "identity_unverifiable", reason: "account_not_attested", loginStatus: "unknown" };
    const probe = createRunnerClaudeCliConnectionProbe(async command => {
      if (command === RUNNER_CLAUDE_VERSION_COMMAND) return version;
      if (command === RUNNER_CLAUDE_AUTH_STATUS_COMMAND) return auth;
      return { kind: "rejected", reason: "unsupported local command" };
    }, { workspaceId: binding.workspaceId, resolveAccountId: dependencies.resolveAccountId });
    const outcome = await probe({ id: "claude-code-cli", label: "Claude local", kind: "api",
      trustLevel: "reviewed", supportsMcp: false, supportsToolUse: false }, []);
    if (outcome.connectionState === "connected" && uuid.safeParse(outcome.accountId).success) {
      return { ...recognized, status: "observed", reason: "account_observed", accountRef: outcome.accountId! };
    }
    return { ...recognized, status: "identity_unverifiable", reason: "account_not_attested" };
  } catch { return { ...base, status: "unavailable", reason: "probe_unavailable", scope }; }
}
