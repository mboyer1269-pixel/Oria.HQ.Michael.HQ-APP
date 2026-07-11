// src/server/agents/runtimes/local-runtime-dispatch.ts
//
// Local subscription CLI dispatch corridor — DRY-RUN first.
//
// Mandate: Yellow stages 1–3 (CLI / marketplace / Studio). This module is
// stage 1: plan a Claude Code or Codex CLI invocation without spawning a
// subprocess. Real execution stays behind a future written approval + env
// gate; this PR never enablesDispatch.
//
// Invariants:
//   * argv only — never a shell-interpolated string
//   * personal_local exposure only
//   * evidence pack mode is dry_run; enablesDispatch is literal false
//   * checkCliArguments rejects secret-shaped material
//   * no cookies / OAuth interception / scraping

import { checkCliArguments } from "@/server/agents/providers/cli-runtime-provider-contract";
import {
  redactEvidenceText,
  validateRuntimeEvidencePack,
  type RuntimeEvidencePack,
} from "@/server/agents/evidence/runtime-evidence-pack";
import {
  KNOWN_LOCAL_RUNTIME_CAPABILITIES,
  type LocalRuntimeKind,
  type LocalRuntimePermissionMode,
} from "./local-runtime-contract";

export type LocalRuntimeDryRunInput = {
  kind: LocalRuntimeKind;
  /** Task / prompt text passed as a single argv element (never shell-interpolated). */
  prompt: string;
  requestedBy: string;
  permissionMode?: LocalRuntimePermissionMode;
  /** Injected clock for deterministic tests. */
  nowIso?: string;
};

export type LocalRuntimeDryRunResult =
  | {
      ok: true;
      kind: LocalRuntimeKind;
      binaryName: string;
      /** Planned argv — never executed by this module. */
      plannedArgv: readonly string[];
      executed: false;
      enablesDispatch: false;
      evidencePack: RuntimeEvidencePack;
    }
  | {
      ok: false;
      errors: readonly string[];
      executed: false;
      enablesDispatch: false;
    };

const MAX_PROMPT_CHARS = 4_000;

function resolveCapability(kind: LocalRuntimeKind) {
  return KNOWN_LOCAL_RUNTIME_CAPABILITIES.find((c) => c.kind === kind) ?? null;
}

/**
 * Build the argv a future invocation PR would pass to spawn (no shell).
 * Claude: `claude -p <prompt> --output-format json [--permission-mode plan]`
 * Codex:  `codex exec <prompt>`
 */
export function buildLocalRuntimeArgv(
  kind: LocalRuntimeKind,
  prompt: string,
  permissionMode: LocalRuntimePermissionMode = "default",
): { ok: true; binaryName: string; argv: string[] } | { ok: false; errors: string[] } {
  const capability = resolveCapability(kind);
  if (!capability) {
    return { ok: false, errors: [`unknown local runtime kind "${kind}"`] };
  }
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return { ok: false, errors: ["prompt must be a non-empty string"] };
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, errors: [`prompt exceeds ${MAX_PROMPT_CHARS} characters`] };
  }

  const argv: string[] = [capability.binaryName];
  if (kind === "claude_code_cli") {
    argv.push(capability.headlessInvocation, prompt, "--output-format", "json");
    if (permissionMode === "plan") {
      argv.push("--permission-mode", "plan");
    } else if (permissionMode === "accept_edits") {
      argv.push("--permission-mode", "acceptEdits");
    }
  } else {
    // codex_cli
    argv.push(capability.headlessInvocation, prompt);
  }

  const argCheck = checkCliArguments(argv);
  if (!argCheck.ok) {
    return {
      ok: false,
      errors: [`argv[${argCheck.rejectedIndex}]: ${argCheck.reason}`],
    };
  }

  return { ok: true, binaryName: capability.binaryName, argv };
}

function buildDryRunEvidencePack(input: {
  kind: LocalRuntimeKind;
  prompt: string;
  requestedBy: string;
  argv: readonly string[];
  nowIso: string;
}): RuntimeEvidencePack {
  const redactedPrompt = redactEvidenceText(input.prompt);
  const commandSummary = redactEvidenceText(input.argv.join(" "));
  const pack: RuntimeEvidencePack = {
    packVersion: 1,
    runtimeKind: input.kind,
    runtimeId: `${input.kind}.personal_local`,
    requestedBy: input.requestedBy,
    taskIntent: redactedPrompt.text.slice(0, 500) || "local CLI dry-run plan",
    mode: "dry_run",
    exposure: "personal_local",
    allowedTools: [],
    deniedTools: ["shell", "network", "browser"],
    commandSummary: commandSummary.text,
    filesTouched: [],
    repoStatusBefore: "unchanged",
    repoStatusAfter: "unchanged",
    validationSummary: { status: "not_run", detail: "dry-run only — no subprocess spawned" },
    riskLevel: "low",
    sentinelleDecision: null,
    outcome: "dry_run_completed",
    enablesDispatch: false,
    ledgerRequired: true,
    evidenceItems: [
      {
        label: "planned_argv",
        detail: commandSummary.text,
        provenance: {
          capturedBy: "local_runtime_dispatch",
          capturedAtIso: input.nowIso,
        },
      },
      {
        label: "execution_gate",
        detail: "subprocess status remains future_pr — dry_run never enablesDispatch",
        provenance: {
          capturedBy: "local_runtime_dispatch",
          capturedAtIso: input.nowIso,
        },
      },
    ],
    redactionsApplied: redactedPrompt.reded + commandSummary.reded,
    nextAction: "approve",
    createdAtIso: input.nowIso,
  };
  return pack;
}

/**
 * Plan a local subscription CLI invocation. Never spawns a process.
 * Returns a validated dry_run evidence pack with enablesDispatch=false.
 */
export function planLocalRuntimeDryRun(input: LocalRuntimeDryRunInput): LocalRuntimeDryRunResult {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const permissionMode = input.permissionMode ?? "default";

  if (typeof input.requestedBy !== "string" || input.requestedBy.trim().length === 0) {
    return {
      ok: false,
      errors: ["requestedBy must identify the requester"],
      executed: false,
      enablesDispatch: false,
    };
  }

  const built = buildLocalRuntimeArgv(input.kind, input.prompt, permissionMode);
  if (!built.ok) {
    return { ok: false, errors: built.errors, executed: false, enablesDispatch: false };
  }

  const evidencePack = buildDryRunEvidencePack({
    kind: input.kind,
    prompt: input.prompt,
    requestedBy: input.requestedBy.trim(),
    argv: built.argv,
    nowIso,
  });

  const validation = validateRuntimeEvidencePack(evidencePack);
  if (!validation.ok) {
    return {
      ok: false,
      errors: validation.errors,
      executed: false,
      enablesDispatch: false,
    };
  }

  return {
    ok: true,
    kind: input.kind,
    binaryName: built.binaryName,
    plannedArgv: built.argv,
    executed: false,
    enablesDispatch: false,
    evidencePack,
  };
}
