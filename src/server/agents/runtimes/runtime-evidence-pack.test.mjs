#!/usr/bin/env node

// Runtime Evidence Pack v1 contract — see docs/RUNTIME_EVIDENCE_PACK_V1.md.
//
// Pins the standard proof format every future runtime movement must produce:
// provenance-or-nothing, execution success is impossible without validation +
// Sentinelle approval, a dry_run/probe touches nothing, secrets are
// inexpressible, the Ledger has no opt-out, and a pack never enables dispatch.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Runtime Evidence Pack v1 contract", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "runtime-evidence-pack.ts"));
  const {
    FORBIDDEN_PACK_FIELDS,
    MAX_EVIDENCE_ITEMS,
    redactPackText,
    findForbiddenPackFields,
    validateRuntimeEvidencePack,
    buildRuntimeEvidencePack,
  } = mod;

  const NOW = "2026-07-03T05:00:00.000Z";

  const provenance = (over = {}) => ({
    sourceLabel: "claude auth status --json",
    sourceRuntime: "claude_code_cli",
    capturedAtIso: NOW,
    ...over,
  });

  const evItem = (n) => ({
    id: `ev-${n}`,
    summary: `evidence line ${n}`,
    provenance: provenance(),
  });

  // A minimal, contract-valid probe pack for claude_code_cli.
  const validProbePack = () => ({
    runtimeKind: "claude_code_cli",
    runtimeId: "claude_code_cli:michael-machine",
    requestedBy: "oria_command_tower",
    taskIntent: "detect local Claude Code auth",
    mode: "probe",
    outcome: "not_applicable",
    exposure: "personal_local",
    allowedTools: ["claude_version", "claude_auth_status"],
    deniedTools: ["claude_prompt"],
    commandSummary: "claude --version; claude auth status --json",
    filesTouched: [],
    repoStatusBefore: { clean: true, changedFileCount: 0 },
    repoStatusAfter: { clean: true, changedFileCount: 0 },
    validationSummary: null,
    riskLevel: "green",
    sentinelleDecision: "not_required",
    ledgerRequired: true,
    evidenceItems: [evItem(1)],
    redactionsApplied: 0,
    nextAction: "park",
    enablesDispatch: false,
    createdAtIso: NOW,
  });

  const validExecutionPack = () => ({
    ...validProbePack(),
    runtimeKind: "n8n_execution_rail",
    runtimeId: "n8n_execution_rail:hermes-task-create",
    exposure: "workspace_shared",
    mode: "execution",
    outcome: "execution_success",
    taskIntent: "create hermes task via governed n8n rail",
    filesTouched: [],
    validationSummary: { typecheck: true, lint: true, tests: true, build: true, note: "3285 pass" },
    riskLevel: "yellow",
    sentinelleDecision: "approved",
    nextAction: "merge_manually",
  });

  await t.test("baseline: the reference probe and execution packs are valid", () => {
    assert.deepEqual(validateRuntimeEvidencePack(validProbePack()), { ok: true });
    assert.deepEqual(validateRuntimeEvidencePack(validExecutionPack()), { ok: true });
  });

  await t.test("1. evidence requires provenance", () => {
    const missing = { ...validProbePack(), evidenceItems: [{ id: "x", summary: "s", provenance: null }] };
    const r = validateRuntimeEvidencePack(missing);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /provenance is required/.test(e)));
    const badProv = {
      ...validProbePack(),
      evidenceItems: [{ id: "y", summary: "s", provenance: { sourceLabel: "", sourceRuntime: "nope", capturedAtIso: "bad" } }],
    };
    const r2 = validateRuntimeEvidencePack(badProv);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some((e) => /sourceLabel/.test(e)));
    assert.ok(r2.errors.some((e) => /not a known runtime/.test(e)));
    assert.ok(r2.errors.some((e) => /capturedAtIso/.test(e)));
  });

  await t.test("2. secrets are rejected and redacted", () => {
    // Redaction of free text.
    const { text, redactions } = redactPackText(
      "logged in as micha@example.com with sk-ant-abc123def456 and Bearer xyz.abc.def",
    );
    assert.ok(!text.includes("micha@example.com"));
    assert.ok(!text.includes("sk-ant-abc123def456"));
    assert.ok(redactions >= 3);
    // Forbidden field shapes are inexpressible in a valid pack.
    for (const field of ["cookie", "session_token", "apiKey", "authorization"]) {
      const dirty = { ...validProbePack(), [field]: "whatever" };
      const r = validateRuntimeEvidencePack(dirty);
      assert.equal(r.ok, false, `${field} must invalidate the pack`);
      assert.ok(r.errors.some((e) => /forbidden secret-shaped field/.test(e)));
    }
    assert.ok(FORBIDDEN_PACK_FIELDS.includes("cookie"));
    assert.ok(FORBIDDEN_PACK_FIELDS.includes("session_token"));
  });

  await t.test("3. execution success is impossible without validation summary", () => {
    const noValidation = { ...validExecutionPack(), validationSummary: null };
    const r = validateRuntimeEvidencePack(noValidation);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /requires a validationSummary/.test(e)));
    const partialValidation = {
      ...validExecutionPack(),
      validationSummary: { typecheck: true, lint: false, tests: true, build: true, note: "" },
    };
    const r2 = validateRuntimeEvidencePack(partialValidation);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some((e) => /typecheck, lint, tests, and build/.test(e)));
  });

  await t.test("4. dry_run cannot claim files modified", () => {
    const dryRunWithFiles = {
      ...validProbePack(),
      mode: "dry_run",
      filesTouched: ["src/foo.ts"],
    };
    const r = validateRuntimeEvidencePack(dryRunWithFiles);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /cannot claim files were modified/.test(e)));
    // And a mismatched repo status is caught too.
    const dryRunWithTreeChange = {
      ...validProbePack(),
      mode: "dry_run",
      repoStatusAfter: { clean: false, changedFileCount: 2 },
    };
    const r2 = validateRuntimeEvidencePack(dryRunWithTreeChange);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some((e) => /before\/after must match/.test(e)));
  });

  await t.test("5. a probe pack enables no dispatch", () => {
    const pack = validProbePack();
    assert.equal(pack.enablesDispatch, false);
    const sneaky = { ...pack, enablesDispatch: true };
    const r = validateRuntimeEvidencePack(sneaky);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /enablesDispatch must be false/.test(e)));
  });

  await t.test("6. ledgerRequired is literal true", () => {
    const r = validateRuntimeEvidencePack({ ...validProbePack(), ledgerRequired: false });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /ledgerRequired must be true/.test(e)));
  });

  await t.test("7. Sentinelle is required for execution", () => {
    const r = validateRuntimeEvidencePack({
      ...validExecutionPack(),
      outcome: "execution_partial",
      sentinelleDecision: "not_required",
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /requires a Sentinelle decision/.test(e)));
  });

  await t.test("8. runtimeId must map to a known runtime kind", () => {
    const unknownKind = validateRuntimeEvidencePack({ ...validProbePack(), runtimeKind: "skynet" });
    assert.equal(unknownKind.ok, false);
    assert.ok(unknownKind.errors.some((e) => /unknown runtimeKind/.test(e)));
    const mislabeled = validateRuntimeEvidencePack({
      ...validProbePack(),
      runtimeId: "codex_cli:some-machine", // does not match runtimeKind claude_code_cli
    });
    assert.equal(mislabeled.ok, false);
    assert.ok(mislabeled.errors.some((e) => /namespaced by its runtimeKind/.test(e)));
  });

  await t.test("9. a tool cannot be both allowed and denied", () => {
    const conflict = {
      ...validProbePack(),
      allowedTools: ["claude_version", "shared_tool"],
      deniedTools: ["shared_tool"],
    };
    const r = validateRuntimeEvidencePack(conflict);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /both allowed and denied/.test(e)));
  });

  await t.test("10. nextAction must be in the governance vocabulary", () => {
    for (const action of ["approve", "reject", "fix", "park", "merge_manually", "retry"]) {
      const r = validateRuntimeEvidencePack({ ...validProbePack(), nextAction: action });
      assert.equal(r.ok, true, `${action} must be accepted`);
    }
    const bad = validateRuntimeEvidencePack({ ...validProbePack(), nextAction: "self_destruct" });
    assert.equal(bad.ok, false);
    assert.ok(bad.errors.some((e) => /governance vocabulary/.test(e)));
  });

  await t.test("11. personal/local runtime cannot target shared exposure", () => {
    for (const kind of ["claude_code_cli", "codex_cli", "gemini_cli"]) {
      const r = validateRuntimeEvidencePack({
        ...validProbePack(),
        runtimeKind: kind,
        runtimeId: `${kind}:m`,
        exposure: "workspace_shared",
      });
      assert.equal(r.ok, false, `${kind} must be pinned to personal_local`);
      assert.ok(r.errors.some((e) => /personal\/local/.test(e)));
    }
    // A workspace-facing runtime (n8n) may be workspace_shared.
    assert.deepEqual(validateRuntimeEvidencePack(validExecutionPack()), { ok: true });
  });

  await t.test("12. pack size is bounded", () => {
    const tooMany = {
      ...validProbePack(),
      evidenceItems: Array.from({ length: MAX_EVIDENCE_ITEMS + 1 }, (_, i) => evItem(i)),
    };
    const r = validateRuntimeEvidencePack(tooMany);
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => new RegExp(`${MAX_EVIDENCE_ITEMS}-item bound`).test(e)));
    const hugeIntent = { ...validProbePack(), taskIntent: "x".repeat(600) };
    const r2 = validateRuntimeEvidencePack(hugeIntent);
    assert.equal(r2.ok, false);
    assert.ok(r2.errors.some((e) => /taskIntent exceeds/.test(e)));
  });

  await t.test("builder: redacts free text and records the count; result validates", () => {
    const pack = buildRuntimeEvidencePack({
      runtimeKind: "claude_code_cli",
      runtimeId: "claude_code_cli:michael",
      requestedBy: "oria_command_tower",
      taskIntent: "probe for michael@example.com's engines",
      mode: "probe",
      allowedTools: ["claude_version"],
      commandSummary: "claude auth status --json  (key sk-ant-verysecret123456)",
      riskLevel: "green",
      nextAction: "park",
      evidenceItems: [
        { id: "e1", summary: "loggedIn true for org 06e7421e-6478-4124-b2fa-3aff4368260a", provenance: provenance() },
      ],
      createdAtIso: NOW,
    });
    assert.ok(!JSON.stringify(pack).includes("michael@example.com"));
    assert.ok(!JSON.stringify(pack).includes("sk-ant-verysecret123456"));
    assert.ok(!JSON.stringify(pack).includes("06e7421e-6478"));
    assert.ok(pack.redactionsApplied >= 3);
    assert.equal(pack.ledgerRequired, true);
    assert.equal(pack.enablesDispatch, false);
    assert.deepEqual(validateRuntimeEvidencePack(pack), { ok: true });
    assert.deepEqual(findForbiddenPackFields(pack), []);
  });

  await t.test("builder is deterministic", () => {
    const input = {
      runtimeKind: "codex_cli",
      runtimeId: "codex_cli:michael",
      requestedBy: "oria",
      taskIntent: "detect codex",
      mode: "probe",
      createdAtIso: NOW,
    };
    assert.deepEqual(buildRuntimeEvidencePack(input), buildRuntimeEvidencePack(input));
  });
});
