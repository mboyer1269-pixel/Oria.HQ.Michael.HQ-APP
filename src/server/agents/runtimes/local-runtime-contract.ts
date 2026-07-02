// src/server/agents/runtimes/local-runtime-contract.ts
//
// Pure contracts for LOCAL SUBSCRIPTION RUNTIMES — official vendor CLIs
// (Claude Code, Codex CLI) authenticated with Michael's personal subscription
// accounts and run on Michael's own machine.
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// Runtimes are adapters, never core. Sentinelle keeps the authority; the
// Ledger keeps the proof. Reality gate: docs/LOCAL_SUBSCRIPTION_RUNTIME_GATE.md
//
// NOT the same module as src/server/runtime/local-runtime.ts — that file is
// the mission runtime mock (HMAC-signed instructions, dry-run echo). This
// module governs subscription CLI runtimes. Same words, different layer.
//
// Invariants encoded here:
//    1. A local runtime is never assumed available — availability is a probe
//       OUTPUT backed by evidence, and unknown auth is not available.
//    2. account_login auth is permitted only for personal/local exposure.
//    3. An API key is referenced by environment variable NAME, never a value.
//    4. Cookie and session-token auth channels are inexpressible and rejected.
//    5. Browser scraping is forbidden.
//    6. Reverse proxies are forbidden.
//    7. Invocation requires Sentinelle — no policy without the gate.
//    8. The Ledger has no opt-out.
//    9. Dangerous permission modes are rejected by default.
//   10. Runtime output must be structured or explicitly marked untrusted.
//   11. Subprocess execution stays "future_pr" unless explicitly approved in
//       writing.
//   12. A personal runtime can never be exposed to tenants or customers.
//
// No side effects, no I/O, no network, no subprocess, no process.env reads.

import type { ExecutionZone } from "@/core/types";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The only two sanctioned subscription CLI runtimes. */
export type LocalRuntimeKind = "claude_code_cli" | "codex_cli";

/**
 * How the runtime authenticates. "account_login" means the vendor CLI drives
 * its own official login flow — Oria never sees a token. "unknown" is a valid
 * PROBE finding, never a valid basis for invocation.
 */
export type LocalRuntimeAuthMode = "account_login" | "api_key" | "unknown";

/**
 * The only expressible exposure. A personal subscription serves Michael on
 * this machine — workspaces, tenants, and customers are not a legal target.
 */
export type LocalRuntimeExposure = "personal_local";

/** Permission modes a policy may request. Dangerous modes are not in here. */
export type LocalRuntimePermissionMode = "default" | "plan" | "accept_edits";

/**
 * Auth channels that are permanently forbidden. Listed as a type so the
 * safety boundary can prove it covers every one of them.
 */
export type ForbiddenAuthChannel =
  | "cookie"
  | "session_token"
  | "browser_scrape"
  | "reverse_proxy"
  | "oauth_interception";

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

/** What a runtime CAN do — catalog knowledge, not a probe finding. */
export type LocalRuntimeCapability = {
  kind: LocalRuntimeKind;
  /** CLI binary expected on PATH, e.g. "claude", "codex". */
  binaryName: string;
  /** Headless entry point, e.g. "-p" (claude) or "exec" (codex). */
  headlessInvocation: string;
  supportsStructuredJsonOutput: boolean;
  supportsMcp: boolean;
  supportsToolUse: boolean;
  /** Documentation of the official subscription plans covering this runtime. */
  subscriptionPlans: readonly string[];
};

export type LocalRuntimeAuthDescriptor =
  | { mode: "account_login"; exposure: LocalRuntimeExposure }
  | {
      /** Metered fallback. The env var NAME (e.g. "OPENAI_API_KEY") — never a value. */
      mode: "api_key";
      apiKeyEnvVar: string;
    }
  | { mode: "unknown" };

/**
 * The evidence a (future) detection probe produces. This contract defines the
 * shape only — nothing in this module runs a probe.
 */
export type LocalRuntimeProbeResult = {
  kind: LocalRuntimeKind;
  /** When the evidence was gathered. Availability without evidence is void. */
  probedAtIso: string;
  binaryDetected: boolean;
  version: string | null;
  authMode: LocalRuntimeAuthMode;
  /** A probe OUTPUT — never an assumption (invariant 1). */
  available: boolean;
};

/** Output handling: structured, or explicitly untrusted. Nothing in between. */
export type LocalRuntimeOutputPolicy =
  | { format: "structured_json"; schemaRequired: true }
  | { format: "raw_text"; treatAsUntrusted: true };

/** Subprocess execution is a future PR until approved in writing. */
export type LocalRuntimeSubprocessPolicy =
  | { status: "future_pr" }
  | { status: "approved"; approvalReference: string };

export type LocalRuntimeInvocationPolicy = {
  kind: LocalRuntimeKind;
  exposure: LocalRuntimeExposure;
  auth: LocalRuntimeAuthDescriptor;
  permissionMode: LocalRuntimePermissionMode;
  /** Gate metadata handed to Sentinelle — input, never a bypass. */
  sentinelle: {
    defaultZone: ExecutionZone;
    requiresApprovalForToolUse: boolean;
  };
  /** The type forbids opting out of either. Validators guard untyped data. */
  sentinelleRequired: true;
  ledgerRequired: true;
  subprocess: LocalRuntimeSubprocessPolicy;
  output: LocalRuntimeOutputPolicy;
};

/**
 * The safety boundary a registry snapshot must carry. Every flag is a literal
 * `true` and the forbidden-channel list must be COMPLETE — the validator
 * checks coverage against the ForbiddenAuthChannel vocabulary.
 */
export type LocalRuntimeSafetyBoundary = {
  forbiddenAuthChannels: readonly ForbiddenAuthChannel[];
  cookieAuthForbidden: true;
  sessionTokenAuthForbidden: true;
  browserScrapingForbidden: true;
  reverseProxyForbidden: true;
  tenantExposureForbidden: true;
};

// ---------------------------------------------------------------------------
// Known capabilities — catalog data, no I/O
// ---------------------------------------------------------------------------

/**
 * Catalog knowledge about the two sanctioned runtimes. Flags recorded here
 * are expectations; the future probe re-verifies reality at detection time.
 */
export const KNOWN_LOCAL_RUNTIME_CAPABILITIES: readonly LocalRuntimeCapability[] = [
  {
    kind: "claude_code_cli",
    binaryName: "claude",
    headlessInvocation: "-p",
    supportsStructuredJsonOutput: true,
    supportsMcp: true,
    supportsToolUse: true,
    subscriptionPlans: ["pro", "max", "team", "enterprise", "console-api"],
  },
  {
    kind: "codex_cli",
    binaryName: "codex",
    headlessInvocation: "exec",
    supportsStructuredJsonOutput: true,
    supportsMcp: true,
    supportsToolUse: true,
    subscriptionPlans: ["plus", "pro", "business", "edu", "enterprise", "api-key"],
  },
];

// ---------------------------------------------------------------------------
// Validation — pure, no throw, no I/O
// ---------------------------------------------------------------------------

export type ContractValidation = { ok: true } | { ok: false; errors: readonly string[] };

// Exhaustiveness-checked vocabularies: `satisfies Record<Union, true>` makes
// the compiler fail when a union member is added or removed without updating
// the runtime list — the arrays cannot silently drift from the types.
const RUNTIME_KINDS = Object.keys({
  claude_code_cli: true,
  codex_cli: true,
} satisfies Record<LocalRuntimeKind, true>) as readonly LocalRuntimeKind[];
const AUTH_MODES = Object.keys({
  account_login: true,
  api_key: true,
  unknown: true,
} satisfies Record<LocalRuntimeAuthMode, true>) as readonly LocalRuntimeAuthMode[];
const PERMISSION_MODES = Object.keys({
  default: true,
  plan: true,
  accept_edits: true,
} satisfies Record<LocalRuntimePermissionMode, true>) as readonly LocalRuntimePermissionMode[];
const EXECUTION_ZONES = Object.keys({
  green: true,
  yellow: true,
  red: true,
} satisfies Record<ExecutionZone, true>) as readonly ExecutionZone[];
const FORBIDDEN_AUTH_CHANNELS = Object.keys({
  cookie: true,
  session_token: true,
  browser_scrape: true,
  reverse_proxy: true,
  oauth_interception: true,
} satisfies Record<ForbiddenAuthChannel, true>) as readonly ForbiddenAuthChannel[];

/**
 * Known dangerous permission modes, kept as data so the rejection message can
 * name the offense instead of calling it merely "unknown" (invariant 9).
 */
const DANGEROUS_PERMISSION_MODES: readonly string[] = [
  "bypass_permissions",
  "dangerously_skip_permissions",
  "yolo",
  "full_auto",
  "full_access",
  "no_sandbox",
];

const ENV_VAR_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const MAX_ENV_VAR_NAME_LENGTH = 64;

/** True when the string is a plausible environment variable NAME, not a value. */
function isEnvVarName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ENV_VAR_NAME_LENGTH &&
    ENV_VAR_NAME_PATTERN.test(value)
  );
}

export function validateLocalRuntimeCapability(
  capability: LocalRuntimeCapability,
): ContractValidation {
  const errors: string[] = [];

  if (!RUNTIME_KINDS.includes(capability.kind)) {
    errors.push(`unknown local runtime kind "${capability.kind}"`);
  }
  if (typeof capability.binaryName !== "string" || !/^[a-z][a-z0-9-]*$/.test(capability.binaryName)) {
    errors.push(
      `runtime "${capability.kind}": binaryName must be a plain binary name, not a path or command line`,
    );
  }
  if (
    typeof capability.headlessInvocation !== "string" ||
    capability.headlessInvocation.trim().length === 0
  ) {
    errors.push(`runtime "${capability.kind}": headlessInvocation must be non-empty`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateLocalRuntimeAuth(
  kind: LocalRuntimeKind,
  auth: LocalRuntimeAuthDescriptor,
): ContractValidation {
  const errors: string[] = [];
  const mode = auth.mode as string;

  if (FORBIDDEN_AUTH_CHANNELS.includes(mode as ForbiddenAuthChannel)) {
    // Untyped snapshots must hear exactly why, not just "unknown mode".
    errors.push(
      `runtime "${kind}": auth channel "${mode}" is permanently forbidden — ` +
        `only official CLI login or an API key env var NAME are sanctioned`,
    );
  } else if (!AUTH_MODES.includes(auth.mode)) {
    errors.push(`runtime "${kind}": unknown auth mode "${mode}"`);
  }

  if (auth.mode === "account_login" && auth.exposure !== "personal_local") {
    errors.push(
      `runtime "${kind}": account_login auth is permitted only for personal_local exposure — ` +
        `a personal subscription never serves tenants`,
    );
  }
  if (auth.mode === "api_key" && !isEnvVarName(auth.apiKeyEnvVar)) {
    errors.push(
      `runtime "${kind}": apiKeyEnvVar must be an environment variable NAME ` +
        `(e.g. "OPENAI_API_KEY"), never a secret value`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateLocalRuntimeProbeResult(
  probe: LocalRuntimeProbeResult,
): ContractValidation {
  const errors: string[] = [];

  if (!RUNTIME_KINDS.includes(probe.kind)) {
    errors.push(`unknown local runtime kind "${probe.kind}"`);
  }
  if (typeof probe.probedAtIso !== "string" || Number.isNaN(Date.parse(probe.probedAtIso))) {
    errors.push(`probe "${probe.kind}": probedAtIso must be a valid ISO timestamp — ` +
      `availability without evidence is void`);
  }
  if (typeof probe.available !== "boolean") {
    errors.push(`probe "${probe.kind}": available must be an explicit boolean`);
  }
  if (probe.available === true) {
    if (probe.binaryDetected !== true) {
      errors.push(
        `probe "${probe.kind}": available requires binaryDetected — ` +
          `a local runtime is never assumed available`,
      );
    }
    if (probe.authMode === "unknown" || !AUTH_MODES.includes(probe.authMode)) {
      errors.push(
        `probe "${probe.kind}": available requires a known auth mode — ` +
          `"unknown" auth is a finding, not a basis for invocation`,
      );
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateLocalRuntimeInvocationPolicy(
  policy: LocalRuntimeInvocationPolicy,
): ContractValidation {
  const errors: string[] = [];

  if (!RUNTIME_KINDS.includes(policy.kind)) {
    errors.push(`unknown local runtime kind "${policy.kind}"`);
  }
  if ((policy.exposure as string) !== "personal_local") {
    errors.push(
      `policy "${policy.kind}": exposure must be "personal_local" — a personal ` +
        `subscription runtime is never exposed to workspaces, tenants, or customers`,
    );
  }

  const authValidation = validateLocalRuntimeAuth(policy.kind, policy.auth);
  if (!authValidation.ok) {
    errors.push(...authValidation.errors);
  }

  const requestedMode = policy.permissionMode as string;
  if (DANGEROUS_PERMISSION_MODES.includes(requestedMode)) {
    errors.push(
      `policy "${policy.kind}": permission mode "${requestedMode}" is dangerous and ` +
        `rejected by default — approval-skipping runtimes are not governable`,
    );
  } else if (!PERMISSION_MODES.includes(policy.permissionMode)) {
    errors.push(`policy "${policy.kind}": unknown permission mode "${requestedMode}"`);
  }

  const gate = policy.sentinelle;
  if (!gate || !EXECUTION_ZONES.includes(gate.defaultZone)) {
    errors.push(`policy "${policy.kind}": sentinelle.defaultZone must be green, yellow, or red`);
  }
  if (!gate || typeof gate.requiresApprovalForToolUse !== "boolean") {
    errors.push(
      `policy "${policy.kind}": sentinelle.requiresApprovalForToolUse must be an explicit boolean`,
    );
  }
  // The type already forbids false on both; these guard untyped data.
  if ((policy.sentinelleRequired as boolean) !== true) {
    errors.push(`policy "${policy.kind}": sentinelleRequired must be true — no gate, no runtime`);
  }
  if ((policy.ledgerRequired as boolean) !== true) {
    errors.push(`policy "${policy.kind}": ledgerRequired must be true — Ledger has no opt-out`);
  }

  const subprocess = policy.subprocess;
  if (!subprocess || (subprocess.status !== "future_pr" && subprocess.status !== "approved")) {
    errors.push(
      `policy "${policy.kind}": subprocess.status must be "future_pr" or "approved"`,
    );
  } else if (
    subprocess.status === "approved" &&
    (typeof subprocess.approvalReference !== "string" ||
      subprocess.approvalReference.trim().length < 8)
  ) {
    errors.push(
      `policy "${policy.kind}": approved subprocess execution requires a written ` +
        `approvalReference — "approved" without a trace is not approved`,
    );
  }

  const output = policy.output;
  if (!output || (output.format !== "structured_json" && output.format !== "raw_text")) {
    errors.push(
      `policy "${policy.kind}": output.format must be "structured_json" or "raw_text"`,
    );
  } else if (output.format === "structured_json" && (output.schemaRequired as boolean) !== true) {
    errors.push(`policy "${policy.kind}": structured_json output requires schemaRequired: true`);
  } else if (output.format === "raw_text" && (output.treatAsUntrusted as boolean) !== true) {
    errors.push(
      `policy "${policy.kind}": raw_text output must be marked treatAsUntrusted — ` +
        `model output is a prompt-injection surface`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function validateLocalRuntimeSafetyBoundary(
  boundary: LocalRuntimeSafetyBoundary,
): ContractValidation {
  const errors: string[] = [];

  const declared = new Set(boundary.forbiddenAuthChannels ?? []);
  for (const channel of FORBIDDEN_AUTH_CHANNELS) {
    if (!declared.has(channel)) {
      errors.push(
        `safety boundary: forbiddenAuthChannels must include "${channel}" — the ban list is complete or it is nothing`,
      );
    }
  }

  const literalFlags = [
    ["cookieAuthForbidden", boundary.cookieAuthForbidden],
    ["sessionTokenAuthForbidden", boundary.sessionTokenAuthForbidden],
    ["browserScrapingForbidden", boundary.browserScrapingForbidden],
    ["reverseProxyForbidden", boundary.reverseProxyForbidden],
    ["tenantExposureForbidden", boundary.tenantExposureForbidden],
  ] as const;
  for (const [flag, value] of literalFlags) {
    // The type already forbids false; this guards untyped data.
    if ((value as boolean) !== true) {
      errors.push(`safety boundary: ${flag} must be true — there is no opt-out`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
