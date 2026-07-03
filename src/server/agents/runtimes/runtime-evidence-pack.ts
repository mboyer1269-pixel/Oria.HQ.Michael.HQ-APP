// src/server/agents/runtimes/runtime-evidence-pack.ts
//
// Runtime Evidence Pack v1 — the STANDARD black-box record every runtime
// movement must produce before Oria trusts it. Design:
// docs/RUNTIME_EVIDENCE_PACK_V1.md
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// Runtimes/providers are adapters. Sentinelle keeps the authority; the Ledger
// keeps the proof. A ready runtime earns no right to execute — proof of a
// movement is separate from permission for it, and this module is the proof.
//
// This is a CONTRACT. It launches nothing: no subprocess, no MCP, no external
// call, no DB, no dispatch. It defines the shape of an evidence pack and the
// pure rules a valid pack must satisfy, so that the future dispatch PRs
// (Claude dry-run, Codex dry-run, Memex, Zapier) all speak the same proof
// language and none can claim success without validation and provenance.
//
// Invariants encoded here:
//    1. Every evidence item carries provenance or the pack is invalid.
//    2. A "probe" pack enables no dispatch — enablesDispatch is literal false.
//    3. A "dry_run" pack cannot claim files were modified.
//    4. An "execution" pack cannot report success without a validation summary
//       AND a Sentinelle approval — "worked" without proof is not worked.
//    5. Sentinelle approval is required for any mode beyond probe/dry_run.
//    6. ledgerRequired is literal true — the Ledger has no opt-out.
//    7. runtimeId must resolve to a known runtimeKind.
//    8. Unknown tools are denied by default; a tool cannot be both allowed and
//       denied.
//    9. nextAction is one of a closed governance vocabulary.
//   10. Secret/cookie/session/token-shaped fields are inexpressible; content is
//       redacted and the redaction count is recorded.
//   11. A personal/local runtime can never target tenant/customer exposure.
//   12. The pack is size-bounded — evidence is a record, not a data lake.

import type { ExecutionZone } from "@/core/types";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Every runtime that may ever produce a pack. Union covers the sanctioned
 * CLIs, the future MCP corridors (Memex, Zapier), and the governed n8n rail —
 * so one proof format spans them all.
 */
export type RuntimeKind =
  | "claude_code_cli"
  | "codex_cli"
  | "gemini_cli"
  | "memex_mcp"
  | "zapier_mcp"
  | "n8n_execution_rail";

/** What a pack is evidence OF. Ordered by escalating authority. */
export type EvidenceMode = "probe" | "dry_run" | "execution";

/** The result an execution pack may claim. Non-execution packs use "n/a". */
export type EvidenceOutcome =
  | "not_applicable"
  | "execution_success"
  | "execution_failure"
  | "execution_partial";

/** Exposure surface. A personal/local runtime is bound to "personal_local". */
export type EvidenceExposure = "personal_local" | "workspace_shared";

/** The Sentinelle verdict carried into the pack — input, never a bypass. */
export type SentinelleDecision =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

/**
 * The closed set of next actions a pack may recommend. Governance vocabulary —
 * a pack cannot invent an escape hatch.
 */
export type EvidenceNextAction =
  | "approve"
  | "reject"
  | "fix"
  | "park"
  | "merge_manually"
  | "retry";

/** Risk bands mirror the execution-zone idiom used across the codebase. */
export type EvidenceRiskLevel = ExecutionZone;

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

/** Where a single piece of evidence came from — mandatory (invariant 1). */
export type EvidenceProvenance = {
  /** e.g. "claude auth status --json", "n8n webhook response", "git status". */
  sourceLabel: string;
  /** The runtime/tool that produced this line. */
  sourceRuntime: RuntimeKind;
  capturedAtIso: string;
};

export type EvidenceItem = {
  id: string;
  /** Redacted, human-readable summary — never raw credential material. */
  summary: string;
  provenance: EvidenceProvenance | null;
};

/** A validation run's distilled result. Required to claim execution success. */
export type ValidationSummary = {
  typecheck: boolean;
  lint: boolean;
  tests: boolean;
  build: boolean;
  /** Free-form, redacted note (e.g. "3285 tests pass"). */
  note: string;
};

/**
 * A git working-tree snapshot label. Kept as a coarse, non-sensitive shape:
 * the pack records THAT the tree changed and how much, never file contents.
 */
export type RepoStatusSnapshot = {
  clean: boolean;
  changedFileCount: number;
};

/**
 * The evidence pack itself. Every field is present so a reviewer (human or
 * Sentinelle) can reconstruct exactly what a runtime movement was, what it
 * touched, and whether it may proceed.
 */
export type RuntimeEvidencePack = {
  runtimeKind: RuntimeKind;
  /** Stable runtime instance id; must resolve to runtimeKind (invariant 7). */
  runtimeId: string;
  requestedBy: string;
  /** What the movement was FOR — a human-legible intent, redacted. */
  taskIntent: string;
  mode: EvidenceMode;
  outcome: EvidenceOutcome;
  exposure: EvidenceExposure;
  allowedTools: readonly string[];
  deniedTools: readonly string[];
  /** Redacted one-line summary of the command(s) — never a runnable string. */
  commandSummary: string;
  filesTouched: readonly string[];
  repoStatusBefore: RepoStatusSnapshot;
  repoStatusAfter: RepoStatusSnapshot;
  validationSummary: ValidationSummary | null;
  riskLevel: EvidenceRiskLevel;
  sentinelleDecision: SentinelleDecision;
  /** Literal true — the type forbids opting out (invariant 6). */
  ledgerRequired: true;
  evidenceItems: readonly EvidenceItem[];
  /** How many values were redacted while building this pack (invariant 10). */
  redactionsApplied: number;
  nextAction: EvidenceNextAction;
  /** Literal false — a pack is a record, it never enables dispatch. */
  enablesDispatch: false;
  createdAtIso: string;
};

// ---------------------------------------------------------------------------
// Exhaustiveness-checked vocabularies — arrays cannot drift from the types
// ---------------------------------------------------------------------------

const RUNTIME_KINDS = Object.keys({
  claude_code_cli: true,
  codex_cli: true,
  gemini_cli: true,
  memex_mcp: true,
  zapier_mcp: true,
  n8n_execution_rail: true,
} satisfies Record<RuntimeKind, true>) as readonly RuntimeKind[];

const EVIDENCE_MODES = Object.keys({
  probe: true,
  dry_run: true,
  execution: true,
} satisfies Record<EvidenceMode, true>) as readonly EvidenceMode[];

const EVIDENCE_OUTCOMES = Object.keys({
  not_applicable: true,
  execution_success: true,
  execution_failure: true,
  execution_partial: true,
} satisfies Record<EvidenceOutcome, true>) as readonly EvidenceOutcome[];

const EVIDENCE_EXPOSURES = Object.keys({
  personal_local: true,
  workspace_shared: true,
} satisfies Record<EvidenceExposure, true>) as readonly EvidenceExposure[];

const SENTINELLE_DECISIONS = Object.keys({
  not_required: true,
  pending: true,
  approved: true,
  rejected: true,
} satisfies Record<SentinelleDecision, true>) as readonly SentinelleDecision[];

const NEXT_ACTIONS = Object.keys({
  approve: true,
  reject: true,
  fix: true,
  park: true,
  merge_manually: true,
  retry: true,
} satisfies Record<EvidenceNextAction, true>) as readonly EvidenceNextAction[];

const RISK_LEVELS = Object.keys({
  green: true,
  yellow: true,
  red: true,
} satisfies Record<EvidenceRiskLevel, true>) as readonly EvidenceRiskLevel[];

/**
 * Which runtimes are personal/local — those can never target a shared
 * exposure. The MCP corridors and the n8n rail are workspace-facing.
 */
const PERSONAL_LOCAL_RUNTIMES: readonly RuntimeKind[] = [
  "claude_code_cli",
  "codex_cli",
  "gemini_cli",
];

/** Modes that require a Sentinelle decision path (invariant 5). */
const MODES_REQUIRING_SENTINELLE: readonly EvidenceMode[] = ["execution"];

// ---------------------------------------------------------------------------
// Redaction — nothing secret-shaped survives into a pack
// ---------------------------------------------------------------------------

/** Field names that must never appear anywhere in a pack (invariant 10). */
export const FORBIDDEN_PACK_FIELDS: readonly string[] = [
  "cookie",
  "cookies",
  "session",
  "sessiontoken",
  "session_token",
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "authorization",
  "proxy",
  "reverseproxy",
  "reverse_proxy",
  "oauth",
];

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
  { pattern: /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g, replacement: "[token-like redacted]" },
];

/** Redacts secret-looking values and returns the cleaned text + a hit count. */
export function redactPackText(text: string): { text: string; redactions: number } {
  let out = typeof text === "string" ? text : String(text ?? "");
  let redactions = 0;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, () => {
      redactions += 1;
      return rule.replacement;
    });
  }
  return { text: out, redactions };
}

/** Deep-scans a value for forbidden field names, returning offending paths. */
export function findForbiddenPackFields(value: unknown, path = ""): readonly string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const found: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_PACK_FIELDS.includes(key.toLowerCase())) {
      found.push(keyPath);
    }
    found.push(...findForbiddenPackFields(child, keyPath));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Validation — pure, no throw, no I/O
// ---------------------------------------------------------------------------

export type ContractValidation = { ok: true } | { ok: false; errors: readonly string[] };

export const MAX_EVIDENCE_ITEMS = 50;
export const MAX_TOOLS = 100;
export const MAX_FILES_TOUCHED = 500;
export const MAX_TEXT_FIELD_CHARS = 500;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateProvenance(
  provenance: EvidenceProvenance | null,
  itemId: string,
): readonly string[] {
  if (provenance === null || typeof provenance !== "object") {
    return [`evidence item "${itemId}": provenance is required — untraceable evidence is noise`];
  }
  const errors: string[] = [];
  if (!isNonEmptyString(provenance.sourceLabel)) {
    errors.push(`evidence item "${itemId}": provenance.sourceLabel must be non-empty`);
  }
  if (!RUNTIME_KINDS.includes(provenance.sourceRuntime)) {
    errors.push(
      `evidence item "${itemId}": provenance.sourceRuntime "${provenance.sourceRuntime}" is not a known runtime`,
    );
  }
  if (!isIsoTimestamp(provenance.capturedAtIso)) {
    errors.push(`evidence item "${itemId}": provenance.capturedAtIso must be a valid ISO timestamp`);
  }
  return errors;
}

/**
 * Validates a pack against every invariant. Pure and total: returns an errors
 * list, never throws — untyped/hostile data becomes findings, not crashes.
 */
export function validateRuntimeEvidencePack(pack: RuntimeEvidencePack): ContractValidation {
  const errors: string[] = [];

  // --- vocabulary + identity (invariant 7) ---
  if (!RUNTIME_KINDS.includes(pack.runtimeKind)) {
    errors.push(`unknown runtimeKind "${pack.runtimeKind}"`);
  }
  if (!isNonEmptyString(pack.runtimeId)) {
    errors.push("runtimeId must be a non-empty identifier that resolves to runtimeKind");
  } else if (RUNTIME_KINDS.includes(pack.runtimeKind) && !pack.runtimeId.startsWith(pack.runtimeKind)) {
    // A stable convention: the instance id is namespaced by its kind, so a
    // pack can never mislabel which engine produced it.
    errors.push(
      `runtimeId "${pack.runtimeId}" must be namespaced by its runtimeKind "${pack.runtimeKind}"`,
    );
  }
  if (!isNonEmptyString(pack.requestedBy)) {
    errors.push("requestedBy must be non-empty");
  }
  if (!isNonEmptyString(pack.taskIntent)) {
    errors.push("taskIntent must be non-empty");
  }
  if (!EVIDENCE_MODES.includes(pack.mode)) {
    errors.push(`unknown mode "${pack.mode}"`);
  }
  if (!EVIDENCE_OUTCOMES.includes(pack.outcome)) {
    errors.push(`unknown outcome "${pack.outcome}"`);
  }
  if (!EVIDENCE_EXPOSURES.includes(pack.exposure)) {
    errors.push(`unknown exposure "${pack.exposure}"`);
  }
  if (!RISK_LEVELS.includes(pack.riskLevel)) {
    errors.push(`unknown riskLevel "${pack.riskLevel}"`);
  }
  if (!SENTINELLE_DECISIONS.includes(pack.sentinelleDecision)) {
    errors.push(`unknown sentinelleDecision "${pack.sentinelleDecision}"`);
  }
  if (!NEXT_ACTIONS.includes(pack.nextAction)) {
    errors.push(`unknown nextAction "${pack.nextAction}" — not in the governance vocabulary`);
  }
  if (!isIsoTimestamp(pack.createdAtIso)) {
    errors.push("createdAtIso must be a valid ISO timestamp");
  }

  // --- literal guards (invariants 2, 6) ---
  if ((pack.ledgerRequired as boolean) !== true) {
    errors.push("ledgerRequired must be true — the Ledger has no opt-out");
  }
  if ((pack.enablesDispatch as boolean) !== false) {
    errors.push("enablesDispatch must be false — a pack is a record, never a dispatch trigger");
  }

  // --- exposure discipline (invariant 11) ---
  if (
    PERSONAL_LOCAL_RUNTIMES.includes(pack.runtimeKind) &&
    pack.exposure !== "personal_local"
  ) {
    errors.push(
      `runtime "${pack.runtimeKind}" is personal/local — exposure must be "personal_local", ` +
        `never a tenant/customer-shared surface`,
    );
  }

  // --- tool discipline (invariant 8) ---
  if (!Array.isArray(pack.allowedTools) || !Array.isArray(pack.deniedTools)) {
    errors.push("allowedTools and deniedTools must be arrays");
  } else {
    const overlap = pack.allowedTools.filter((tool) => pack.deniedTools.includes(tool));
    if (overlap.length > 0) {
      errors.push(
        `tools cannot be both allowed and denied: ${overlap.join(", ")} — a tool has one verdict`,
      );
    }
    if (pack.allowedTools.length + pack.deniedTools.length > MAX_TOOLS) {
      errors.push(`tool lists exceed the ${MAX_TOOLS}-entry bound`);
    }
  }

  // --- mode ↔ files discipline (invariant 3) ---
  if (!Array.isArray(pack.filesTouched)) {
    errors.push("filesTouched must be an array");
  } else if (pack.filesTouched.length > MAX_FILES_TOUCHED) {
    errors.push(`filesTouched exceeds the ${MAX_FILES_TOUCHED}-entry bound`);
  }
  if ((pack.mode === "probe" || pack.mode === "dry_run") && (pack.filesTouched?.length ?? 0) > 0) {
    errors.push(
      `mode "${pack.mode}" cannot claim files were modified — a ${pack.mode} touches nothing`,
    );
  }
  if (
    (pack.mode === "probe" || pack.mode === "dry_run") &&
    pack.repoStatusAfter &&
    pack.repoStatusBefore &&
    pack.repoStatusAfter.changedFileCount !== pack.repoStatusBefore.changedFileCount
  ) {
    errors.push(
      `mode "${pack.mode}" must not change the working tree — repoStatus before/after must match`,
    );
  }

  // --- outcome ↔ mode discipline ---
  if (pack.mode !== "execution" && pack.outcome !== "not_applicable") {
    errors.push(`mode "${pack.mode}" must report outcome "not_applicable" — only execution has a result`);
  }

  // --- execution success requires proof (invariant 4) ---
  if (pack.mode === "execution" && pack.outcome === "execution_success") {
    if (!pack.validationSummary || typeof pack.validationSummary !== "object") {
      errors.push(
        "execution_success requires a validationSummary — success without validation is a claim, not proof",
      );
    } else {
      const v = pack.validationSummary;
      if (!(v.typecheck && v.lint && v.tests && v.build)) {
        errors.push(
          "execution_success requires typecheck, lint, tests, and build to all pass",
        );
      }
    }
    if (pack.sentinelleDecision !== "approved") {
      errors.push(
        "execution_success requires an approved Sentinelle decision — the gate is not optional",
      );
    }
  }

  // --- Sentinelle required beyond probe/dry_run (invariant 5) ---
  if (MODES_REQUIRING_SENTINELLE.includes(pack.mode) && pack.sentinelleDecision === "not_required") {
    errors.push(
      `mode "${pack.mode}" requires a Sentinelle decision — "not_required" is only for probe/dry_run`,
    );
  }

  // --- evidence provenance + bound (invariants 1, 12) ---
  if (!Array.isArray(pack.evidenceItems)) {
    errors.push("evidenceItems must be an array");
  } else {
    if (pack.evidenceItems.length > MAX_EVIDENCE_ITEMS) {
      errors.push(`evidenceItems exceeds the ${MAX_EVIDENCE_ITEMS}-item bound`);
    }
    for (const item of pack.evidenceItems) {
      const id = isNonEmptyString(item?.id) ? item.id : "(no id)";
      if (!isNonEmptyString(item?.summary)) {
        errors.push(`evidence item "${id}": summary must be non-empty`);
      }
      errors.push(...validateProvenance(item?.provenance ?? null, id));
    }
  }

  // --- redaction bookkeeping (invariant 10) ---
  if (typeof pack.redactionsApplied !== "number" || pack.redactionsApplied < 0) {
    errors.push("redactionsApplied must be a non-negative number");
  }
  const forbidden = findForbiddenPackFields(pack);
  if (forbidden.length > 0) {
    errors.push(
      `forbidden secret-shaped field(s) present: ${forbidden.join(", ")} — packs never carry credential material`,
    );
  }

  // --- text field bounds (invariant 12) ---
  for (const [label, value] of [
    ["taskIntent", pack.taskIntent],
    ["commandSummary", pack.commandSummary],
  ] as const) {
    if (typeof value === "string" && value.length > MAX_TEXT_FIELD_CHARS) {
      errors.push(`${label} exceeds the ${MAX_TEXT_FIELD_CHARS}-char bound`);
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Builder — assembles a redacted, contract-valid pack from raw inputs
// ---------------------------------------------------------------------------

export type RuntimeEvidencePackInput = {
  runtimeKind: RuntimeKind;
  runtimeId: string;
  requestedBy: string;
  taskIntent: string;
  mode: EvidenceMode;
  outcome?: EvidenceOutcome;
  exposure?: EvidenceExposure;
  allowedTools?: readonly string[];
  deniedTools?: readonly string[];
  commandSummary?: string;
  filesTouched?: readonly string[];
  repoStatusBefore?: RepoStatusSnapshot;
  repoStatusAfter?: RepoStatusSnapshot;
  validationSummary?: ValidationSummary | null;
  riskLevel?: EvidenceRiskLevel;
  sentinelleDecision?: SentinelleDecision;
  evidenceItems?: readonly { id: string; summary: string; provenance: EvidenceProvenance | null }[];
  nextAction?: EvidenceNextAction;
  createdAtIso: string;
};

const CLEAN_TREE: RepoStatusSnapshot = { clean: true, changedFileCount: 0 };

/**
 * Builds a redacted evidence pack. Every free-text field passes through
 * redaction and the total hit count is recorded. The result is NOT trusted
 * by construction — callers must run validateRuntimeEvidencePack and record
 * the pack to the Ledger. Deterministic: same input, same pack.
 */
export function buildRuntimeEvidencePack(
  input: RuntimeEvidencePackInput,
): RuntimeEvidencePack {
  let redactions = 0;
  const clean = (text: string): string => {
    const result = redactPackText(text);
    redactions += result.redactions;
    return result.text;
  };

  const evidenceItems: EvidenceItem[] = (input.evidenceItems ?? []).map((item) => ({
    id: item.id,
    summary: clean(item.summary),
    provenance: item.provenance
      ? { ...item.provenance, sourceLabel: clean(item.provenance.sourceLabel) }
      : null,
  }));

  return {
    runtimeKind: input.runtimeKind,
    runtimeId: input.runtimeId,
    requestedBy: input.requestedBy,
    taskIntent: clean(input.taskIntent),
    mode: input.mode,
    outcome: input.outcome ?? "not_applicable",
    exposure: input.exposure ?? "personal_local",
    allowedTools: input.allowedTools ?? [],
    deniedTools: input.deniedTools ?? [],
    commandSummary: clean(input.commandSummary ?? ""),
    filesTouched: input.filesTouched ?? [],
    repoStatusBefore: input.repoStatusBefore ?? CLEAN_TREE,
    repoStatusAfter: input.repoStatusAfter ?? CLEAN_TREE,
    validationSummary: input.validationSummary ?? null,
    riskLevel: input.riskLevel ?? "yellow",
    sentinelleDecision: input.sentinelleDecision ?? "not_required",
    ledgerRequired: true,
    evidenceItems,
    redactionsApplied: redactions,
    nextAction: input.nextAction ?? "park",
    enablesDispatch: false,
    createdAtIso: input.createdAtIso,
  };
}
