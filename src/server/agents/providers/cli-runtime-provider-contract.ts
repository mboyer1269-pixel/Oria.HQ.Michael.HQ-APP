// src/server/agents/providers/cli-runtime-provider-contract.ts
//
// Tool Universe Corridor — CLI runtimes (Claude-/Codex-/Gemini-CLASS coding
// CLIs, no vendor hardcoded). The pattern: a locally installed CLI,
// authenticated by the CEO's existing SUBSCRIPTION session (no API key), is
// invoked headlessly as an execution engine.
//
// RULES:
//   * No API key in the repo, ever. Auth is either the CLI's own
//     subscription session (managed by the CLI, outside Oria) or a
//     BYOK env-var REFERENCE — never a value.
//   * Every call is a skillId invocation → Sentinelle → Line → Ledger.
//     The CLI is a hand, not an authority.
//   * machineScope is "local_only": these runtimes exist on the CEO's
//     machine. This is a documented SPOF, accepted and visible — not hidden.
//   * Inline secrets in arguments are rejected by shape before anything
//     else sees them.

import type { AdapterProviderDescriptor } from "./adapter-provider-contract.ts";

export type CliAuthMode = "subscription_session" | "byok_env_ref";

export type CliRuntimeProviderContract = {
  descriptor: AdapterProviderDescriptor & { adapterKind: "cli_runtime" };
  runtime: {
    /** Binary name only (e.g. "claude"), never a path with arguments. */
    binaryName: string;
    authMode: CliAuthMode;
    /** Literal: subscription CLIs run on the local machine only. */
    machineScope: "local_only";
  };
  spof: {
    /** Literal: the single-point-of-failure is documented, not denied. */
    documented: true;
    /** Human note, e.g. "CEO workstation must be on; plan limits apply." */
    note: string;
  };
};

// ---------------------------------------------------------------------------
// Argument hygiene (pure)
// ---------------------------------------------------------------------------

/**
 * Shapes that look like credential material in a CLI argument. Deliberately
 * broad — a false positive costs a rename; a false negative costs a leak.
 */
const SECRET_LIKE_ARG = /(sk-[A-Za-z0-9]{8,}|api[_-]?key\s*[=:]|bearer\s+[A-Za-z0-9._-]{16,}|ghp_[A-Za-z0-9]{16,}|secret\s*[=:])/i;

export type CliArgCheck =
  | { ok: true }
  | { ok: false; rejectedIndex: number; reason: string };

/** Rejects any argument that carries secret-shaped material. Fail-closed. */
export function checkCliArguments(args: readonly string[]): CliArgCheck {
  for (let i = 0; i < args.length; i++) {
    if (SECRET_LIKE_ARG.test(args[i])) {
      return {
        ok: false,
        rejectedIndex: i,
        reason: "Argument carries secret-shaped material — secrets never travel inline.",
      };
    }
  }
  return { ok: true };
}
