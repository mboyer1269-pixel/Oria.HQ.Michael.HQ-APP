// src/server/agents/runtimes/local-runtime-probe.ts
//
// Local Runtime Probe v1 — SAFE detection of the local subscription CLIs
// (Claude Code, Codex, Gemini) for the Command Tower runtime board.
// Design: docs/LOCAL_RUNTIME_PROBE_V1.md · contracts: ./local-runtime-contract.ts
//
// Doctrine: detection is not permission. The probe answers ONE question —
// "which engines exist on this machine and can they prove safe auth?" — and
// produces citeable, redacted evidence. It never sends a prompt, never reads
// or stores a token, never touches cookies/sessions/OAuth/proxies, and never
// executes an action on the repo. `enablesDispatch` is the literal `false`.
//
// Subprocess execution is approved in writing (contract invariant 11):
// see LOCAL_RUNTIME_PROBE_APPROVAL below. Only the frozen allowlist can run;
// every token is validated against a strict character class before spawn, so
// no injection string and no user input can ever reach a shell.
//
// Every failure mode (missing binary, timeout, malformed output, spawn error)
// becomes a STATUS with a reason — the probe never throws toward the UI.

import { execFile } from "node:child_process";
import {
  validateLocalRuntimeProbeResult,
  type LocalRuntimeProbeResult,
  type LocalRuntimeSubprocessPolicy,
} from "./local-runtime-contract";

// ---------------------------------------------------------------------------
// Written approval — invariant 11 of the local runtime contract
// ---------------------------------------------------------------------------

/**
 * The written CEO approval that lets this module spawn subprocesses at all.
 * Anything that invalidates this reference (empty, too short, wrong status)
 * makes the default runner refuse to spawn — commands are rejected, not run.
 */
export const LOCAL_RUNTIME_PROBE_APPROVAL: LocalRuntimeSubprocessPolicy = {
  status: "approved",
  approvalReference:
    "Michael approved Local Runtime Probe v1 after ruleset unlock and merge train",
};

// ---------------------------------------------------------------------------
// Execution environment gate — local/personal ONLY, never the cloud
// ---------------------------------------------------------------------------

/**
 * Explicit opt-in required to spawn in a local production build. Reading the
 * flag is the only env access this module makes; nothing is ever written.
 */
export const LOCAL_PROBE_OPT_IN_ENV_VAR = "ORIA_ENABLE_LOCAL_RUNTIME_PROBE";

/** Presence of any of these means a cloud/serverless host — never spawn. */
const CLOUD_ENV_MARKERS: readonly string[] = [
  "VERCEL",
  "VERCEL_ENV",
  "AWS_LAMBDA_FUNCTION_NAME",
  "K_SERVICE",
  "FLY_APP_NAME",
  "RENDER",
];

export type ProbeEnvironmentDecision = {
  allowed: boolean;
  environment: "local_dev" | "local_explicit" | "cloud" | "production_unflagged";
  reason: string;
};

/**
 * Decides whether this process is a sanctioned place to spawn the probe.
 * A personal subscription probe belongs on Michael's machine and nowhere
 * else: any cloud marker wins over every flag, and a production build only
 * qualifies with the explicit local opt-in. Pure — env is a parameter.
 */
export function resolveProbeExecutionEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): ProbeEnvironmentDecision {
  const marker = CLOUD_ENV_MARKERS.find(
    (key) => typeof env[key] === "string" && env[key] !== "",
  );
  if (marker) {
    return {
      allowed: false,
      environment: "cloud",
      reason: `cloud marker "${marker}" present — a personal local probe never runs in the cloud, even when flagged`,
    };
  }
  if (env.NODE_ENV === "production") {
    if (env[LOCAL_PROBE_OPT_IN_ENV_VAR] !== "1") {
      return {
        allowed: false,
        environment: "production_unflagged",
        reason: `production build without ${LOCAL_PROBE_OPT_IN_ENV_VAR}=1 — no explicit local opt-in, no spawn`,
      };
    }
    return {
      allowed: true,
      environment: "local_explicit",
      reason: `production build explicitly flagged local via ${LOCAL_PROBE_OPT_IN_ENV_VAR}=1`,
    };
  }
  return {
    allowed: true,
    environment: "local_dev",
    reason: "non-production local environment — personal probe sanctioned",
  };
}

// ---------------------------------------------------------------------------
// Allowlist — the ONLY commands this module may ever run
// ---------------------------------------------------------------------------

export type ProbeCommandId =
  | "claude_version"
  | "claude_auth_status"
  | "codex_version"
  | "codex_login_status"
  | "gemini_version";

export type AllowlistedProbeCommand = {
  id: ProbeCommandId;
  /** Plain binary name — never a path, never a command line. */
  binary: "claude" | "codex" | "gemini";
  /** Fixed literal arguments — no user input, ever. */
  args: readonly string[];
};

/**
 * The frozen allowlist. Version reads and non-interactive auth-status reads
 * only — none of these commands sends a prompt, opens a login flow, writes a
 * file, or reads credential material.
 */
export const PROBE_COMMAND_ALLOWLIST: readonly AllowlistedProbeCommand[] = Object.freeze([
  { id: "claude_version", binary: "claude", args: ["--version"] },
  { id: "claude_auth_status", binary: "claude", args: ["auth", "status", "--json"] },
  { id: "codex_version", binary: "codex", args: ["--version"] },
  { id: "codex_login_status", binary: "codex", args: ["login", "status"] },
  { id: "gemini_version", binary: "gemini", args: ["--version"] },
] as AllowlistedProbeCommand[]);

const SAFE_BINARY_PATTERN = /^[a-z][a-z0-9-]*$/;
const SAFE_ARG_PATTERN = /^-{0,2}[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** True only for tokens that cannot carry shell metacharacters or paths. */
export function isShellSafeToken(token: string, kind: "binary" | "arg"): boolean {
  if (typeof token !== "string" || token.length === 0 || token.length > 64) {
    return false;
  }
  return kind === "binary" ? SAFE_BINARY_PATTERN.test(token) : SAFE_ARG_PATTERN.test(token);
}

/**
 * A command is allowlisted only when it is EXACTLY one of the frozen entries
 * (same id, same binary, same args) AND every token independently passes the
 * safe-token check. Injection strings fail both gates.
 */
export function isAllowlistedProbeCommand(command: AllowlistedProbeCommand): boolean {
  if (!command || typeof command !== "object") {
    return false;
  }
  const match = PROBE_COMMAND_ALLOWLIST.find((entry) => entry.id === command.id);
  if (!match) {
    return false;
  }
  if (command.binary !== match.binary) {
    return false;
  }
  if (!Array.isArray(command.args) || command.args.length !== match.args.length) {
    return false;
  }
  if (!command.args.every((arg, index) => arg === match.args[index])) {
    return false;
  }
  if (!isShellSafeToken(command.binary, "binary")) {
    return false;
  }
  return command.args.every((arg) => isShellSafeToken(arg, "arg"));
}

// ---------------------------------------------------------------------------
// Redaction — nothing personal or secret-looking leaves this module
// ---------------------------------------------------------------------------

/** Order matters: specific shapes (emails, keys) before the generic net. */
const REDACTION_RULES: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[email redacted]" },
  {
    pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    replacement: "[id redacted]",
  },
  { pattern: /\b(?:sk|pk|rk|key)-[A-Za-z0-9_-]{8,}\b/gi, replacement: "[key redacted]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "[bearer redacted]" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\b/g, replacement: "[jwt redacted]" },
  { pattern: /[A-Za-z]:\\Users\\[^\s"'`]+/g, replacement: "[path redacted]" },
  { pattern: /(?:\/home|\/Users)\/[^\s"'`]+/g, replacement: "[path redacted]" },
  { pattern: /\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, replacement: "[token-like redacted]" },
];

const MAX_EVIDENCE_LENGTH = 200;

/** Redacts secret-looking values from any probe text before it is kept. */
export function redactProbeText(text: string): string {
  let out = typeof text === "string" ? text : String(text ?? "");
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out.length > MAX_EVIDENCE_LENGTH ? `${out.slice(0, MAX_EVIDENCE_LENGTH)}…` : out;
}

/**
 * Field names that must never appear anywhere in probe evidence — the probe
 * has no business holding cookies, sessions, proxies, or credential material.
 */
export const FORBIDDEN_EVIDENCE_FIELDS: readonly string[] = [
  "cookie",
  "cookies",
  "session",
  "sessiontoken",
  "session_token",
  "proxy",
  "reverseproxy",
  "reverse_proxy",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "oauth",
];

/** Deep-scans a value for forbidden field names. Returns the offending paths. */
export function findForbiddenEvidenceFields(value: unknown, path = ""): readonly string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_EVIDENCE_FIELDS.includes(key.toLowerCase())) {
      found.push(keyPath);
    }
    found.push(...findForbiddenEvidenceFields(child, keyPath));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Runner contract — the ONLY door to a subprocess
// ---------------------------------------------------------------------------

export type ProbeCommandOutcome =
  | { kind: "completed"; exitCode: number; stdout: string; stderr: string }
  | { kind: "not_found" }
  | { kind: "timeout"; timeoutMs: number }
  | { kind: "spawn_error"; message: string }
  | { kind: "rejected"; reason: string };

export type ProbeCommandRunner = (
  command: AllowlistedProbeCommand,
) => Promise<ProbeCommandOutcome>;

export const PROBE_COMMAND_TIMEOUT_MS = 10_000;
const PROBE_MAX_BUFFER_BYTES = 1_048_576;

/**
 * Gate in front of any runner: a command that is not the exact frozen
 * allowlist entry is REJECTED without ever invoking the runner.
 */
export async function runProbeCommand(
  command: AllowlistedProbeCommand,
  runner: ProbeCommandRunner,
): Promise<ProbeCommandOutcome> {
  if (!isAllowlistedProbeCommand(command)) {
    return {
      kind: "rejected",
      reason: "command is not on the frozen probe allowlist — refused before spawn",
    };
  }
  try {
    return await runner(command);
  } catch (error) {
    return {
      kind: "spawn_error",
      message: redactProbeText(error instanceof Error ? error.message : String(error)),
    };
  }
}

function spawnOnce(
  binary: string,
  args: readonly string[],
  timeoutMs: number,
  useShell: boolean,
): Promise<ProbeCommandOutcome> {
  return new Promise((resolve) => {
    try {
      // Shell mode concatenates instead of escaping (DEP0190), so the whole
      // command line is built here from tokens that already passed the strict
      // character class — no escaping is ever needed, nothing variable exists.
      const file = useShell ? [binary, ...args].join(" ") : binary;
      const fileArgs = useShell ? [] : [...args];
      execFile(
        file,
        fileArgs,
        {
          timeout: timeoutMs,
          windowsHide: true,
          shell: useShell,
          maxBuffer: PROBE_MAX_BUFFER_BYTES,
          encoding: "utf8",
        },
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
          if (err.code === "ENOENT") {
            resolve({ kind: "not_found" });
            return;
          }
          if (typeof err.code === "number") {
            resolve({
              kind: "completed",
              exitCode: err.code,
              stdout: stdout ?? "",
              stderr: stderr ?? "",
            });
            return;
          }
          resolve({
            kind: "spawn_error",
            message: redactProbeText(err.message ?? String(err.code ?? "spawn failed")),
          });
        },
      );
    } catch (error) {
      resolve({
        kind: "spawn_error",
        message: redactProbeText(error instanceof Error ? error.message : String(error)),
      });
    }
  });
}

/** cmd.exe reports a missing binary as exit≠0 text instead of ENOENT. */
function normalizeWindowsShellOutcome(outcome: ProbeCommandOutcome): ProbeCommandOutcome {
  if (
    outcome.kind === "completed" &&
    outcome.exitCode !== 0 &&
    /is not recognized|n'est pas reconnu|cannot find|introuvable/i.test(
      `${outcome.stderr} ${outcome.stdout}`,
    )
  ) {
    return { kind: "not_found" };
  }
  return outcome;
}

/**
 * The default runner. Spawns WITHOUT a shell first. On Windows, npm-installed
 * CLIs are `.cmd` shims that Node refuses to spawn shell-less (EINVAL), so a
 * single constrained retry uses the shell — safe here because the command is
 * a frozen literal that already passed the strict token check; no user input
 * exists anywhere in this code path. POSIX never uses a shell.
 *
 * An invalid approval turns the runner into a refusal machine: every command
 * is rejected, nothing spawns (contract invariant 11). Same for a forbidden
 * execution environment: cloud hosts and unflagged production builds get a
 * runner that refuses everything — defense in depth behind the source's own
 * early bail.
 */
export function createExecFileProbeRunner(
  approval: LocalRuntimeSubprocessPolicy,
  options?: {
    timeoutMs?: number;
    /** Injectable for tests; defaults to the real process environment. */
    env?: Readonly<Record<string, string | undefined>>;
  },
): ProbeCommandRunner {
  const timeoutMs = options?.timeoutMs ?? PROBE_COMMAND_TIMEOUT_MS;
  const environment = resolveProbeExecutionEnvironment(options?.env ?? process.env);
  const approvalValid =
    approval !== null &&
    typeof approval === "object" &&
    approval.status === "approved" &&
    typeof approval.approvalReference === "string" &&
    approval.approvalReference.trim().length >= 8;

  return async (command) => {
    if (!environment.allowed) {
      return {
        kind: "rejected",
        reason: `execution environment forbidden: ${environment.reason}`,
      };
    }
    if (!approvalValid) {
      return {
        kind: "rejected",
        reason: "subprocess execution is not approved in writing — nothing spawns",
      };
    }
    if (!isAllowlistedProbeCommand(command)) {
      return {
        kind: "rejected",
        reason: "command is not on the frozen probe allowlist — refused before spawn",
      };
    }
    const direct = await spawnOnce(command.binary, command.args, timeoutMs, false);
    const needsWindowsShellRetry =
      process.platform === "win32" &&
      (direct.kind === "not_found" ||
        (direct.kind === "spawn_error" && /EINVAL/i.test(direct.message)));
    if (!needsWindowsShellRetry) {
      return direct;
    }
    const viaShell = await spawnOnce(command.binary, command.args, timeoutMs, true);
    return normalizeWindowsShellOutcome(viaShell);
  };
}

// ---------------------------------------------------------------------------
// Classification — pure functions from outcomes to honest statuses
// ---------------------------------------------------------------------------

export type ProbedRuntimeId = "claude_code_cli" | "codex_cli" | "gemini_cli";

/**
 * v1 status vocabulary. "ready" demands positive auth evidence;
 * "installed_unverified" is the honest ceiling when no safe non-interactive
 * auth check exists; everything broken lands on "unavailable" or "blocked".
 */
export type ProbedRuntimeStatus =
  | "not_configured"
  | "unavailable"
  | "blocked"
  | "ready"
  | "installed_unverified";

export type ProbedRuntimeEntry = {
  id: ProbedRuntimeId;
  status: ProbedRuntimeStatus;
  version: string | null;
  /** The exact displayable reason for the status — Command Tower shows it. */
  reason: string;
  /** Redacted, citeable evidence lines. */
  evidence: readonly string[];
  probedAtIso: string;
  /** Contract-shaped result (null for runtimes outside the #325 contract). */
  contract: LocalRuntimeProbeResult | null;
};

function parseVersionLine(stdout: string): string | null {
  const line = redactProbeText((stdout ?? "").trim().split(/\r?\n/, 1)[0] ?? "").trim();
  if (line.length === 0 || line.length > 64 || !/\d/.test(line)) {
    return null;
  }
  return line;
}

/** Maps a failed VERSION outcome to a status; null means the version is ok. */
function versionFailure(
  outcome: ProbeCommandOutcome,
): { status: ProbedRuntimeStatus; reason: string; evidence: string } | null {
  switch (outcome.kind) {
    case "not_found":
      return {
        status: "not_configured",
        reason: "Binaire introuvable sur le PATH — runtime non installé sur cette machine.",
        evidence: "version command → binary not found",
      };
    case "timeout":
      return {
        status: "unavailable",
        reason: `Commande de version expirée après ${outcome.timeoutMs} ms — aucun statut vérifiable.`,
        evidence: `version command → timeout ${outcome.timeoutMs}ms`,
      };
    case "rejected":
      return {
        status: "unavailable",
        reason: `Commande refusée avant exécution : ${outcome.reason}`,
        evidence: `version command → rejected: ${redactProbeText(outcome.reason)}`,
      };
    case "spawn_error":
      return {
        status: "unavailable",
        reason: "Échec du lancement de la commande de version — aucun statut vérifiable.",
        evidence: `version command → spawn error: ${redactProbeText(outcome.message)}`,
      };
    case "completed":
      if (outcome.exitCode !== 0) {
        return {
          status: "unavailable",
          reason: `La commande de version a retourné le code ${outcome.exitCode} — aucun statut vérifiable.`,
          evidence: `version command → exit ${outcome.exitCode}`,
        };
      }
      return null;
  }
}

/** Only these fields from `claude auth status --json` may become evidence. */
const CLAUDE_AUTH_EVIDENCE_FIELDS: readonly string[] = [
  "loggedIn",
  "authMethod",
  "apiProvider",
  "subscriptionType",
];

export function classifyClaudeCodeProbe(
  versionOutcome: ProbeCommandOutcome,
  authOutcome: ProbeCommandOutcome,
  probedAtIso: string,
): ProbedRuntimeEntry {
  const id: ProbedRuntimeId = "claude_code_cli";
  const failed = versionFailure(versionOutcome);
  if (failed) {
    return {
      id,
      status: failed.status,
      version: null,
      reason: failed.reason,
      evidence: [`claude --version → ${failed.evidence.split("→")[1]?.trim() ?? failed.evidence}`],
      probedAtIso,
      contract: {
        kind: id,
        probedAtIso,
        binaryDetected: false,
        version: null,
        authMode: "unknown",
        available: false,
      },
    };
  }
  const version =
    versionOutcome.kind === "completed" ? parseVersionLine(versionOutcome.stdout) : null;
  const versionEvidence = `claude --version → ${version ?? "sortie sans numéro de version"}`;

  const unverified = (reason: string, evidence: string): ProbedRuntimeEntry => ({
    id,
    status: "unavailable",
    version,
    reason,
    evidence: [versionEvidence, evidence],
    probedAtIso,
    contract: {
      kind: id,
      probedAtIso,
      binaryDetected: true,
      version,
      authMode: "unknown",
      available: false,
    },
  });

  if (authOutcome.kind === "timeout") {
    return unverified(
      `Vérification d'auth expirée après ${authOutcome.timeoutMs} ms — pas de preuve, pas de ready.`,
      `claude auth status --json → timeout ${authOutcome.timeoutMs}ms`,
    );
  }
  if (authOutcome.kind === "not_found" || authOutcome.kind === "spawn_error") {
    return unverified(
      "Vérification d'auth impossible à lancer — pas de preuve, pas de ready.",
      `claude auth status --json → ${authOutcome.kind === "spawn_error" ? `spawn error: ${redactProbeText(authOutcome.message)}` : "binary not found"}`,
    );
  }
  if (authOutcome.kind === "rejected") {
    return unverified(
      `Vérification d'auth refusée avant exécution : ${authOutcome.reason}`,
      `claude auth status --json → rejected: ${redactProbeText(authOutcome.reason)}`,
    );
  }
  if (authOutcome.exitCode !== 0) {
    return unverified(
      `La vérification d'auth a retourné le code ${authOutcome.exitCode} — pas de preuve, pas de ready.`,
      `claude auth status --json → exit ${authOutcome.exitCode}`,
    );
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    const candidate: unknown = JSON.parse(authOutcome.stdout.trim());
    parsed =
      candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
  } catch {
    parsed = null;
  }
  if (parsed === null) {
    return unverified(
      "Sortie d'auth non-JSON — aucune preuve exploitable, pas de ready.",
      "claude auth status --json → malformed output",
    );
  }

  // Whitelist, never redact-and-hope: email/orgId/orgName are simply not read.
  const authFacts = CLAUDE_AUTH_EVIDENCE_FIELDS.filter((field) => field in parsed)
    .map((field) => `${field}: ${redactProbeText(String(parsed[field]))}`)
    .join(" · ");
  const authEvidence = `claude auth status --json → ${authFacts || "aucun champ attendu"}`;

  if (parsed.loggedIn === true) {
    return {
      id,
      status: "ready",
      version,
      reason:
        "Connecté via le login CLI officiel (abonnement personnel). Détection ≠ permission : aucun dispatch sans approbation.",
      evidence: [versionEvidence, authEvidence],
      probedAtIso,
      contract: {
        kind: id,
        probedAtIso,
        binaryDetected: true,
        version,
        authMode: "account_login",
        available: true,
      },
    };
  }
  if (parsed.loggedIn === false) {
    return {
      id,
      status: "blocked",
      version,
      reason:
        "Installé mais non connecté — lancer `claude auth login` manuellement (le probe n'ouvre jamais un login).",
      evidence: [versionEvidence, authEvidence],
      probedAtIso,
      contract: {
        kind: id,
        probedAtIso,
        binaryDetected: true,
        version,
        authMode: "unknown",
        available: false,
      },
    };
  }
  return unverified(
    "Sortie d'auth sans champ loggedIn exploitable — aucune preuve, pas de ready.",
    authEvidence,
  );
}

export function classifyCodexProbe(
  versionOutcome: ProbeCommandOutcome,
  loginOutcome: ProbeCommandOutcome,
  probedAtIso: string,
): ProbedRuntimeEntry {
  const id: ProbedRuntimeId = "codex_cli";
  const failed = versionFailure(versionOutcome);
  if (failed) {
    return {
      id,
      status: failed.status,
      version: null,
      reason: failed.reason,
      evidence: [`codex --version → ${failed.evidence.split("→")[1]?.trim() ?? failed.evidence}`],
      probedAtIso,
      contract: {
        kind: id,
        probedAtIso,
        binaryDetected: false,
        version: null,
        authMode: "unknown",
        available: false,
      },
    };
  }
  const version =
    versionOutcome.kind === "completed" ? parseVersionLine(versionOutcome.stdout) : null;
  const versionEvidence = `codex --version → ${version ?? "sortie sans numéro de version"}`;

  const entry = (
    status: ProbedRuntimeStatus,
    reason: string,
    loginEvidence: string,
    available: boolean,
    authMode: LocalRuntimeProbeResult["authMode"],
  ): ProbedRuntimeEntry => ({
    id,
    status,
    version,
    reason,
    evidence: [versionEvidence, loginEvidence],
    probedAtIso,
    contract: {
      kind: id,
      probedAtIso,
      binaryDetected: true,
      version,
      authMode,
      available,
    },
  });

  if (loginOutcome.kind === "timeout") {
    return entry(
      "unavailable",
      `Vérification de login expirée après ${loginOutcome.timeoutMs} ms — pas de preuve, pas de ready.`,
      `codex login status → timeout ${loginOutcome.timeoutMs}ms`,
      false,
      "unknown",
    );
  }
  if (loginOutcome.kind !== "completed") {
    const detail =
      loginOutcome.kind === "spawn_error"
        ? `spawn error: ${redactProbeText(loginOutcome.message)}`
        : loginOutcome.kind === "rejected"
          ? `rejected: ${redactProbeText(loginOutcome.reason)}`
          : "binary not found";
    return entry(
      "unavailable",
      "Vérification de login impossible — pas de preuve, pas de ready.",
      `codex login status → ${detail}`,
      false,
      "unknown",
    );
  }

  const loginText = redactProbeText(
    `${loginOutcome.stdout} ${loginOutcome.stderr}`.trim().split(/\r?\n/, 1)[0] ?? "",
  );
  const loginEvidence = `codex login status → ${loginText || `exit ${loginOutcome.exitCode}`}`;

  if (loginOutcome.exitCode === 0 && /logged in using chatgpt/i.test(loginText)) {
    return entry(
      "ready",
      "Connecté via le compte ChatGPT officiel (abonnement personnel). Détection ≠ permission : aucun dispatch sans approbation.",
      loginEvidence,
      true,
      "account_login",
    );
  }
  if (/not logged in/i.test(loginText) || loginOutcome.exitCode !== 0) {
    return entry(
      "blocked",
      "Installé mais non connecté — lancer `codex login` manuellement (le probe n'ouvre jamais un login).",
      loginEvidence,
      false,
      "unknown",
    );
  }
  if (/api key/i.test(loginText)) {
    return entry(
      "installed_unverified",
      "Connecté via API key — seul le login compte ChatGPT est une preuve « ready » sanctionnée en v1.",
      loginEvidence,
      false,
      "api_key",
    );
  }
  return entry(
    "unavailable",
    "Sortie de login inattendue — aucune preuve exploitable, pas de ready.",
    loginEvidence,
    false,
    "unknown",
  );
}

export function classifyGeminiProbe(
  versionOutcome: ProbeCommandOutcome,
  probedAtIso: string,
): ProbedRuntimeEntry {
  const id: ProbedRuntimeId = "gemini_cli";
  const failed = versionFailure(versionOutcome);
  if (failed) {
    return {
      id,
      status: failed.status,
      version: null,
      reason: failed.reason,
      evidence: [`gemini --version → ${failed.evidence.split("→")[1]?.trim() ?? failed.evidence}`],
      probedAtIso,
      contract: null,
    };
  }
  const version =
    versionOutcome.kind === "completed" ? parseVersionLine(versionOutcome.stdout) : null;
  return {
    id,
    status: "installed_unverified",
    version,
    reason:
      "Installé, mais aucune commande officielle non interactive ne prouve l'auth — ready impossible sans preuve (contrat v1).",
    evidence: [`gemini --version → ${version ?? "sortie sans numéro de version"}`],
    probedAtIso,
    contract: null,
  };
}

// ---------------------------------------------------------------------------
// Snapshot — what the Command Tower receives
// ---------------------------------------------------------------------------

export type LocalRuntimeProbeSnapshot = {
  probedAtIso: string;
  entries: readonly ProbedRuntimeEntry[];
  /** Literal `false` — detection alone never enables dispatch (doctrine). */
  enablesDispatch: false;
  /** The written approval this probe ran under, for Ledger-style display. */
  approvalReference: string;
};

const STATUSES_REQUIRING_EVIDENCE: readonly ProbedRuntimeStatus[] = [
  "ready",
  "installed_unverified",
];

/**
 * Defensive honesty pass: any entry claiming an evidence-backed status
 * without evidence (or, for "ready", without a contract-valid probe result)
 * is downgraded to "unavailable" — dishonesty degrades, it never crashes.
 */
export function sanitizeProbedEntry(entry: ProbedRuntimeEntry): ProbedRuntimeEntry {
  if (!STATUSES_REQUIRING_EVIDENCE.includes(entry.status)) {
    return entry;
  }
  const hasEvidence = entry.evidence.length > 0 && entry.evidence.every((line) => line.length > 0);
  const contractOk =
    entry.status !== "ready" ||
    (entry.contract !== null && validateLocalRuntimeProbeResult(entry.contract).ok);
  if (hasEvidence && contractOk) {
    return entry;
  }
  return {
    ...entry,
    status: "unavailable",
    reason: `Déclassé : statut « ${entry.status} » réclamé sans preuve valide.`,
    contract:
      entry.contract === null ? null : { ...entry.contract, available: false, authMode: "unknown" },
  };
}

async function probeOneRuntime(
  id: ProbedRuntimeId,
  runner: ProbeCommandRunner,
  probedAtIso: string,
): Promise<ProbedRuntimeEntry> {
  const byId = (commandId: ProbeCommandId): AllowlistedProbeCommand => {
    const found = PROBE_COMMAND_ALLOWLIST.find((entry) => entry.id === commandId);
    if (!found) {
      throw new Error(`probe command "${commandId}" missing from allowlist`);
    }
    return found;
  };
  try {
    if (id === "claude_code_cli") {
      const version = await runProbeCommand(byId("claude_version"), runner);
      const versionOk = version.kind === "completed" && version.exitCode === 0;
      const auth = versionOk
        ? await runProbeCommand(byId("claude_auth_status"), runner)
        : ({ kind: "rejected", reason: "skipped — binary not detected" } as const);
      return sanitizeProbedEntry(classifyClaudeCodeProbe(version, auth, probedAtIso));
    }
    if (id === "codex_cli") {
      const version = await runProbeCommand(byId("codex_version"), runner);
      const versionOk = version.kind === "completed" && version.exitCode === 0;
      const login = versionOk
        ? await runProbeCommand(byId("codex_login_status"), runner)
        : ({ kind: "rejected", reason: "skipped — binary not detected" } as const);
      return sanitizeProbedEntry(classifyCodexProbe(version, login, probedAtIso));
    }
    const version = await runProbeCommand(byId("gemini_version"), runner);
    return sanitizeProbedEntry(classifyGeminiProbe(version, probedAtIso));
  } catch (error) {
    return {
      id,
      status: "unavailable",
      version: null,
      reason: "Erreur interne du probe — aucun statut vérifiable pour ce rendu.",
      evidence: [`probe internal error: ${redactProbeText(error instanceof Error ? error.message : String(error))}`],
      probedAtIso,
      contract: null,
    };
  }
}

/**
 * Probes the three local engines. Never throws; never sends a prompt; never
 * runs anything outside PROBE_COMMAND_ALLOWLIST. Callers may inject a fake
 * runner (tests) or a clock (determinism).
 */
export async function probeLocalRuntimes(options?: {
  runner?: ProbeCommandRunner;
  nowIso?: string;
}): Promise<LocalRuntimeProbeSnapshot> {
  const probedAtIso = options?.nowIso ?? new Date().toISOString();
  const runner =
    options?.runner ?? createExecFileProbeRunner(LOCAL_RUNTIME_PROBE_APPROVAL);
  const ids: readonly ProbedRuntimeId[] = ["claude_code_cli", "codex_cli", "gemini_cli"];
  const entries = await Promise.all(ids.map((id) => probeOneRuntime(id, runner, probedAtIso)));
  return {
    probedAtIso,
    entries,
    enablesDispatch: false,
    approvalReference: LOCAL_RUNTIME_PROBE_APPROVAL.status === "approved"
      ? LOCAL_RUNTIME_PROBE_APPROVAL.approvalReference
      : "",
  };
}
