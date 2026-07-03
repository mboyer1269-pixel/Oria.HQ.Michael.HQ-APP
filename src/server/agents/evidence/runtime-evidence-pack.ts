// src/server/agents/evidence/runtime-evidence-pack.ts
//
// Runtime Evidence Pack v1 — the BLACK BOX every runtime action must fill in
// before Oria believes anything about it. Design: docs/AGENT_EVIDENCE_PACKS_V1.md
//
// Doctrine: Oria = GOVERN. Memex = ORIENT. Hermes/Joris = ACT.
// A dispatch without evidence is an agent acting without a flight recorder.
// This pack exists so the Command Tower can answer, for any runtime action:
// who asked, what was intended, what actually ran, what changed, what proved
// it, and who approved it. No pack, no trust.
//
// Invariants encoded here:
//    1. The field set is CLOSED — unknown fields are rejected, so credential
//       material, tenant references, or authority claims cannot ride along.
//    2. Secret-like field names are rejected anywhere in the pack, deep.
//    3. "execution_success" is impossible without a passed validationSummary
//       AND at least one evidence item with provenance.
//    4. probe / dry_run packs cannot claim real file changes.
//    5. A probe pack can never enable dispatch — enablesDispatch is the
//       literal `false` for every mode.
//    6. ledgerRequired is the literal `true` — the Ledger has no opt-out.
//    7. mode "execution" requires an approved Sentinelle decision.
//    8. runtimeId must map to a known runtime kind.
//    9. Tools are deny-by-default: a tool not explicitly allowlisted (or
//       present in deniedTools) is denied.
//   10. nextAction is a closed enum — no free-text verbs.
//   11. tenant/customer exposure is rejected — these runtimes are personal.
//   12. Pack size is bounded — an unbounded pack is a log dump, not evidence.
//
// No side effects, no I/O, no network, no subprocess, no MCP call,
// no process.env reads. This module DESCRIBES and VALIDATES evidence;
// it never produces any by running something.

import type { ExecutionZone } from "@/core/types";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The engines an evidence pack may describe — mirrors the probe vocabulary. */
export type EvidenceRuntimeKind = "claude_code_cli" | "codex_cli" | "gemini_cli";

/** What kind of action the pack witnesses. */
export type RuntimeEvidenceMode = "probe" | "dry_run" | "execution";

/** The ONLY verbs a reviewer can attach to a pack. */
export type RuntimeNextAction =
  | "approve"
  | "reject"
  | "fix"
  | "park"
  | "merge_manually"
  | "retry";

export type RuntimeRiskLevel = "low" | "medium" | "high";

export type RuntimeEvidenceOutcome =
  | "pending"
  | "probe_completed"
  | "dry_run_completed"
  | "execution_success"
  | "execution_failed";

// ---------------------------------------------------------------------------
// Descriptors
// ---------------------------------------------------------------------------

/** One citeable evidence line. Without provenance it is noise, not evidence. */
export type RuntimeEvidenceItem = {
  label: string;
  /** Redacted, bounded detail — never raw command output dumps. */
  detail: string;
  provenance: {
    /** Which mechanism captured this line (e.g. "local_runtime_probe"). */
    capturedBy: string;
    capturedAtIso: string;
  };
};

/** The Sentinelle verdict this pack ran under. Null only below execution. */
export type RuntimeSentinelleDecision = {
  zone: ExecutionZone;
  approved: boolean;
  /** The written trace of the approval — "approved" without one is void. */
  approvalReference: string | null;
  decidedAtIso: string;
};

export type RuntimeValidationSummary = {
  status: "passed" | "failed" | "not_run";
  /** e.g. "typecheck+lint+test+build green" — bounded, redacted. */
  detail: string;
};

export type RuntimeEvidencePack = {
  packVersion: 1;
  runtimeKind: EvidenceRuntimeKind;
  /** Instance id — must start with its runtimeKind (invariant 8). */
  runtimeId: string;
  requestedBy: string;
  taskIntent: string;
  mode: RuntimeEvidenceMode;
  /** Personal subscription runtimes never serve tenants (invariant 11). */
  exposure: "personal_local";
  allowedTools: readonly string[];
  deniedTools: readonly string[];
  commandSummary: string;
  filesTouched: readonly string[];
  repoStatusBefore: string;
  repoStatusAfter: string;
  validationSummary: RuntimeValidationSummary | null;
  riskLevel: RuntimeRiskLevel;
  sentinelleDecision: RuntimeSentinelleDecision | null;
  outcome: RuntimeEvidenceOutcome;
  /** Literal false — a pack is a witness, never a permission (invariant 5). */
  enablesDispatch: false;
  /** Literal true — the Ledger has no opt-out (invariant 6). */
  ledgerRequired: true;
  evidenceItems: readonly RuntimeEvidenceItem[];
  /** How many redaction rules fired while the pack was assembled. */
  redactionsApplied: number;
  nextAction: RuntimeNextAction;
  createdAtIso: string;
};

// ---------------------------------------------------------------------------
// Redaction — shared by both evidence packs
// ---------------------------------------------------------------------------

/** Order matters: specific shapes (emails, keys) before the generic net. */
const REDACTION_RULES: readonly { pattern: RegExp; replacement: string }[] = [
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: "[email redacted]" },
  { pattern: /\b(?:sk|pk|rk|key)-[A-Za-z0-9_-]{8,}\b/gi, replacement: "[key redacted]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: "[bearer redacted]" },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\b/g, replacement: "[jwt redacted]" },
  { pattern: /\bamh1\.[A-Za-z0-9._-]+/g, replacement: "[handle redacted]" },
  { pattern: /[A-Za-z]:\\Users\\[^\s"'`]+/g, replacement: "[path redacted]" },
  { pattern: /(?:\/home|\/Users)\/[^\s"'`]+/g, replacement: "[path redacted]" },
];

export const MAX_EVIDENCE_DETAIL_LENGTH = 400;

/**
 * Redacts secret-looking values from evidence text and reports how many rules
 * fired, so `redactionsApplied` is a count of facts, not a guess.
 */
export function redactEvidenceText(text: string): { text: string; redactions: number } {
  let out = typeof text === "string" ? text : String(text ?? "");
  let redactions = 0;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, () => {
      redactions += 1;
      return rule.replacement;
    });
  }
  if (out.length > MAX_EVIDENCE_DETAIL_LENGTH) {
    out = `${out.slice(0, MAX_EVIDENCE_DETAIL_LENGTH)}…`;
  }
  return { text: out, redactions };
}

/**
 * Field names that must never appear ANYWHERE in an evidence pack — evidence
 * carries proof, never credentials, sessions, or tenant/customer references.
 */
export const FORBIDDEN_PACK_FIELDS: readonly string[] = [
  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "apikey",
  "api_key",
  "password",
  "secret",
  "cookie",
  "cookies",
  "session",
  "sessiontoken",
  "session_token",
  "oauth",
  "proxy",
  "tenant",
  "tenantid",
  "tenant_id",
  "customer",
  "customerid",
  "customer_id",
];

/** Deep-scans a value for forbidden field names. Returns the offending paths. */
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

// Exhaustiveness-checked vocabularies (`satisfies Record<Union, true>` makes
// the compiler fail when a union member drifts from the runtime list).
const RUNTIME_KINDS = Object.keys({
  claude_code_cli: true,
  codex_cli: true,
  gemini_cli: true,
} satisfies Record<EvidenceRuntimeKind, true>) as readonly EvidenceRuntimeKind[];
const MODES = Object.keys({
  probe: true,
  dry_run: true,
  execution: true,
} satisfies Record<RuntimeEvidenceMode, true>) as readonly RuntimeEvidenceMode[];
const NEXT_ACTIONS = Object.keys({
  approve: true,
  reject: true,
  fix: true,
  park: true,
  merge_manually: true,
  retry: true,
} satisfies Record<RuntimeNextAction, true>) as readonly RuntimeNextAction[];
const RISK_LEVELS = Object.keys({
  low: true,
  medium: true,
  high: true,
} satisfies Record<RuntimeRiskLevel, true>) as readonly RuntimeRiskLevel[];
const OUTCOMES = Object.keys({
  pending: true,
  probe_completed: true,
  dry_run_completed: true,
  execution_success: true,
  execution_failed: true,
} satisfies Record<RuntimeEvidenceOutcome, true>) as readonly RuntimeEvidenceOutcome[];
const EXECUTION_ZONES = Object.keys({
  green: true,
  yellow: true,
  red: true,
} satisfies Record<ExecutionZone, true>) as readonly ExecutionZone[];

/** The CLOSED field set (invariant 1). Anything else is rejected. */
const PACK_FIELDS: readonly string[] = [
  "packVersion",
  "runtimeKind",
  "runtimeId",
  "requestedBy",
  "taskIntent",
  "mode",
  "exposure",
  "allowedTools",
  "deniedTools",
  "commandSummary",
  "filesTouched",
  "repoStatusBefore",
  "repoStatusAfter",
  "validationSummary",
  "riskLevel",
  "sentinelleDecision",
  "outcome",
  "enablesDispatch",
  "ledgerRequired",
  "evidenceItems",
  "redactionsApplied",
  "nextAction",
  "createdAtIso",
];

export const MAX_PACK_JSON_CHARS = 16_000;
export const MAX_EVIDENCE_ITEMS = 50;

function isNonEmptyString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateEvidenceItem(item: RuntimeEvidenceItem, index: number): readonly string[] {
  const errors: string[] = [];
  const where = `evidenceItems[${index}]`;
  if (item === null || typeof item !== "object") {
    return [`${where}: malformed evidence item`];
  }
  if (!isNonEmptyString(item.label, 120)) {
    errors.push(`${where}: label must be a short non-empty string`);
  }
  if (!isNonEmptyString(item.detail, MAX_EVIDENCE_DETAIL_LENGTH + 1)) {
    errors.push(`${where}: detail must be non-empty and bounded`);
  }
  const provenance = item.provenance;
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    !isNonEmptyString(provenance.capturedBy, 120) ||
    !isIsoTimestamp(provenance.capturedAtIso)
  ) {
    errors.push(`${where}: provenance is missing or invalid — untraceable evidence is noise`);
  }
  return errors;
}

export function validateRuntimeEvidencePack(pack: RuntimeEvidencePack): ContractValidation {
  if (pack === null || typeof pack !== "object") {
    return { ok: false, errors: ["pack must be an object"] };
  }
  const errors: string[] = [];

  // Invariant 1: closed field set.
  for (const field of Object.keys(pack)) {
    if (!PACK_FIELDS.includes(field)) {
      errors.push(
        `field "${field}" is not part of the Runtime Evidence Pack v1 contract — ` +
          `authority claims and credential material cannot ride along`,
      );
    }
  }

  // Invariant 2: no secret/tenant field names anywhere, deep.
  for (const offending of findForbiddenPackFields(pack)) {
    errors.push(`forbidden field "${offending}" — evidence never carries secrets or tenants`);
  }

  if ((pack.packVersion as number) !== 1) {
    errors.push(`packVersion must be the literal 1`);
  }
  if (!RUNTIME_KINDS.includes(pack.runtimeKind)) {
    errors.push(`unknown runtimeKind "${pack.runtimeKind}"`);
  }
  // Invariant 8: runtimeId maps to its runtime kind.
  if (
    !isNonEmptyString(pack.runtimeId, 120) ||
    (RUNTIME_KINDS.includes(pack.runtimeKind) && !pack.runtimeId.startsWith(pack.runtimeKind))
  ) {
    errors.push(
      `runtimeId "${pack.runtimeId}" must start with its runtimeKind — ` +
        `an id that maps to no known engine is not auditable`,
    );
  }
  if (!isNonEmptyString(pack.requestedBy, 120)) {
    errors.push("requestedBy must identify the requester");
  }
  if (!isNonEmptyString(pack.taskIntent, 500)) {
    errors.push("taskIntent must state what the action was FOR");
  }
  if (!MODES.includes(pack.mode)) {
    errors.push(`unknown mode "${pack.mode}"`);
  }
  if ((pack.exposure as string) !== "personal_local") {
    errors.push(
      `exposure "${pack.exposure}" is not sanctioned — personal runtimes never serve tenants`,
    );
  }
  if (!Array.isArray(pack.allowedTools) || !Array.isArray(pack.deniedTools)) {
    errors.push("allowedTools and deniedTools must be arrays (empty is fine, absent is not)");
  }
  if (!isNonEmptyString(pack.commandSummary, 500)) {
    errors.push("commandSummary must be a bounded, redacted summary");
  }
  if (!Array.isArray(pack.filesTouched)) {
    errors.push("filesTouched must be an array");
  }
  if (typeof pack.repoStatusBefore !== "string" || typeof pack.repoStatusAfter !== "string") {
    errors.push("repoStatusBefore/repoStatusAfter must be strings (git status snapshots)");
  }
  if (!RISK_LEVELS.includes(pack.riskLevel)) {
    errors.push(`unknown riskLevel "${pack.riskLevel}"`);
  }
  if (!OUTCOMES.includes(pack.outcome)) {
    errors.push(`unknown outcome "${pack.outcome}"`);
  }
  // Invariant 5: a pack never enables dispatch.
  if ((pack.enablesDispatch as boolean) !== false) {
    errors.push("enablesDispatch must be the literal false — a witness is not a permission");
  }
  // Invariant 6: the Ledger has no opt-out.
  if ((pack.ledgerRequired as boolean) !== true) {
    errors.push("ledgerRequired must be the literal true — the Ledger has no opt-out");
  }
  if (!NEXT_ACTIONS.includes(pack.nextAction)) {
    errors.push(
      `nextAction "${pack.nextAction}" is not in the closed verb set ` +
        `(approve/reject/fix/park/merge_manually/retry)`,
    );
  }
  if (!isIsoTimestamp(pack.createdAtIso)) {
    errors.push("createdAtIso must be a valid ISO timestamp");
  }
  if (typeof pack.redactionsApplied !== "number" || pack.redactionsApplied < 0) {
    errors.push("redactionsApplied must be a non-negative count");
  }

  const items = Array.isArray(pack.evidenceItems) ? pack.evidenceItems : [];
  if (!Array.isArray(pack.evidenceItems)) {
    errors.push("evidenceItems must be an array");
  }
  if (items.length > MAX_EVIDENCE_ITEMS) {
    errors.push(`evidenceItems exceeds the ${MAX_EVIDENCE_ITEMS}-item bound`);
  }
  items.forEach((item, index) => errors.push(...validateEvidenceItem(item, index)));

  // Invariant 4: probe/dry_run cannot claim real changes.
  if (pack.mode !== "execution") {
    if (Array.isArray(pack.filesTouched) && pack.filesTouched.length > 0) {
      errors.push(`mode "${pack.mode}" cannot claim touched files — nothing really ran`);
    }
    if (
      typeof pack.repoStatusBefore === "string" &&
      typeof pack.repoStatusAfter === "string" &&
      pack.repoStatusBefore !== pack.repoStatusAfter
    ) {
      errors.push(`mode "${pack.mode}" cannot claim a repo status change — nothing really ran`);
    }
    if (pack.outcome === "execution_success" || pack.outcome === "execution_failed") {
      errors.push(`outcome "${pack.outcome}" is only expressible in execution mode`);
    }
  }
  if (pack.mode === "probe" && pack.outcome === "dry_run_completed") {
    errors.push('a probe pack cannot claim outcome "dry_run_completed"');
  }
  if (pack.mode === "dry_run" && pack.outcome === "probe_completed") {
    errors.push('a dry_run pack cannot claim outcome "probe_completed"');
  }

  // Invariant 7: execution requires an approved Sentinelle decision.
  if (pack.mode === "execution") {
    const decision = pack.sentinelleDecision;
    if (decision === null || typeof decision !== "object") {
      errors.push("execution mode requires a sentinelleDecision — no gate, no execution");
    } else {
      if (!EXECUTION_ZONES.includes(decision.zone)) {
        errors.push(`sentinelleDecision.zone "${decision.zone}" is not a known zone`);
      }
      if (decision.approved !== true) {
        errors.push("execution mode requires sentinelleDecision.approved === true");
      }
      if (!isNonEmptyString(decision.approvalReference ?? "", 200)) {
        errors.push("an approved Sentinelle decision requires a written approvalReference");
      }
      if (!isIsoTimestamp(decision.decidedAtIso)) {
        errors.push("sentinelleDecision.decidedAtIso must be a valid ISO timestamp");
      }
    }
  }

  // Invariant 3: execution_success demands proof.
  if (pack.outcome === "execution_success") {
    const summary = pack.validationSummary;
    if (summary === null || typeof summary !== "object" || summary.status !== "passed") {
      errors.push(
        'outcome "execution_success" is impossible without a PASSED validationSummary — ' +
          "success without validation is a claim, not a fact",
      );
    }
    if (items.length === 0) {
      errors.push(
        'outcome "execution_success" is impossible without evidence items — no proof, no success',
      );
    }
  }
  if (pack.validationSummary !== null && typeof pack.validationSummary === "object") {
    const status = pack.validationSummary.status as string;
    if (status !== "passed" && status !== "failed" && status !== "not_run") {
      errors.push(`validationSummary.status "${status}" is not a known status`);
    }
    if (!isNonEmptyString(pack.validationSummary.detail, 500)) {
      errors.push("validationSummary.detail must be a bounded non-empty string");
    }
  }

  // Invariant 12: bounded pack size.
  try {
    if (JSON.stringify(pack).length > MAX_PACK_JSON_CHARS) {
      errors.push(
        `pack exceeds ${MAX_PACK_JSON_CHARS} JSON characters — a log dump is not evidence`,
      );
    }
  } catch {
    errors.push("pack is not JSON-serializable — evidence must be persistable");
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Tool gate — deny by default (invariant 9)
// ---------------------------------------------------------------------------

export type ToolPermission = { permitted: boolean; reason: string };

/**
 * A tool is permitted only when it is explicitly allowlisted AND not denied.
 * deniedTools wins over allowedTools; an unknown tool is denied by default.
 */
export function isRuntimeToolPermitted(
  pack: Pick<RuntimeEvidencePack, "allowedTools" | "deniedTools">,
  toolName: string,
): ToolPermission {
  if (typeof toolName !== "string" || toolName.trim().length === 0) {
    return { permitted: false, reason: "empty tool name — denied by default" };
  }
  const denied = Array.isArray(pack.deniedTools) ? pack.deniedTools : [];
  const allowed = Array.isArray(pack.allowedTools) ? pack.allowedTools : [];
  if (denied.includes(toolName)) {
    return { permitted: false, reason: `tool "${toolName}" is explicitly denied` };
  }
  if (allowed.includes(toolName)) {
    return { permitted: true, reason: `tool "${toolName}" is explicitly allowlisted` };
  }
  return {
    permitted: false,
    reason: `tool "${toolName}" is not on the allowlist — unknown tools are denied by default`,
  };
}
