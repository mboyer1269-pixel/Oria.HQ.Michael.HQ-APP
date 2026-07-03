#!/usr/bin/env node

// Runtime Evidence Pack v1 — see docs/AGENT_EVIDENCE_PACKS_V1.md.
//
// Pins the black-box rules before any live dispatch exists: provenance or
// nothing, no secrets, success requires validation, dry_run cannot claim real
// changes, probe never enables dispatch, Ledger has no opt-out, Sentinelle
// gates execution, unknown tools are denied, verbs are a closed set, tenant
// exposure is rejected, and the pack size is bounded.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Runtime Evidence Pack v1", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "runtime-evidence-pack.ts"));
  const {
    validateRuntimeEvidencePack,
    isRuntimeToolPermitted,
    redactEvidenceText,
    findForbiddenPackFields,
    MAX_PACK_JSON_CHARS,
  } = mod;

  const NOW = "2026-07-03T18:00:00.000Z";

  const evidenceItem = (overrides = {}) => ({
    label: "probe evidence",
    detail: "claude --version → 2.1.0",
    provenance: { capturedBy: "local_runtime_probe", capturedAtIso: NOW },
    ...overrides,
  });

  const probePack = (overrides = {}) => ({
    packVersion: 1,
    runtimeKind: "claude_code_cli",
    runtimeId: "claude_code_cli.michael-desktop",
    requestedBy: "michael",
    taskIntent: "detect local engines for the Command Tower board",
    mode: "probe",
    exposure: "personal_local",
    allowedTools: [],
    deniedTools: [],
    commandSummary: "claude --version; claude auth status --json",
    filesTouched: [],
    repoStatusBefore: "clean",
    repoStatusAfter: "clean",
    validationSummary: null,
    riskLevel: "low",
    sentinelleDecision: null,
    outcome: "probe_completed",
    enablesDispatch: false,
    ledgerRequired: true,
    evidenceItems: [evidenceItem()],
    redactionsApplied: 0,
    nextAction: "approve",
    createdAtIso: NOW,
    ...overrides,
  });

  const executionPack = (overrides = {}) =>
    probePack({
      mode: "execution",
      taskIntent: "apply an approved one-file fix via Claude Code",
      allowedTools: ["read_file", "edit_file"],
      filesTouched: ["src/example.ts"],
      repoStatusBefore: "clean",
      repoStatusAfter: "1 file modified",
      validationSummary: { status: "passed", detail: "typecheck+lint+test+build green" },
      sentinelleDecision: {
        zone: "yellow",
        approved: true,
        approvalReference: "Michael approved fix mission 2026-07-03",
        decidedAtIso: NOW,
      },
      outcome: "execution_success",
      evidenceItems: [
        evidenceItem({ label: "diff", detail: "src/example.ts: 3 insertions" }),
        evidenceItem({ label: "validation", detail: "npm test → 3285 pass" }),
      ],
      ...overrides,
    });

  await t.test("0. valid probe and execution packs pass", () => {
    assert.deepEqual(validateRuntimeEvidencePack(probePack()), { ok: true });
    assert.deepEqual(validateRuntimeEvidencePack(executionPack()), { ok: true });
  });

  await t.test("1. evidence requires provenance", () => {
    const noProvenance = probePack({
      evidenceItems: [{ label: "x", detail: "y", provenance: null }],
    });
    const result = validateRuntimeEvidencePack(noProvenance);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("provenance")));
  });

  await t.test("2. secret-like fields are rejected, redaction works", () => {
    const smuggled = probePack({ token: "abc" });
    const result = validateRuntimeEvidencePack(smuggled);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes('"token"')));

    // Deep nesting is caught too.
    const nested = probePack({
      evidenceItems: [evidenceItem({ api_key: "sk-notreally" })],
    });
    assert.equal(validateRuntimeEvidencePack(nested).ok, false);
    assert.ok(findForbiddenPackFields({ a: { b: { secret: 1 } } }).includes("a.b.secret"));

    const { text, redactions } = redactEvidenceText(
      "logged in as michael@example.com with key sk-abcdefgh1234 and Bearer abc.def",
    );
    assert.ok(!text.includes("michael@example.com"));
    assert.ok(!text.includes("sk-abcdefgh1234"));
    assert.ok(redactions >= 3);
  });

  await t.test("3. execution_success is impossible without a passed validation summary", () => {
    const noValidation = executionPack({ validationSummary: null });
    const result = validateRuntimeEvidencePack(noValidation);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("validationSummary")));

    const failedValidation = executionPack({
      validationSummary: { status: "failed", detail: "2 tests failing" },
    });
    assert.equal(validateRuntimeEvidencePack(failedValidation).ok, false);

    const noEvidence = executionPack({ evidenceItems: [] });
    const noProof = validateRuntimeEvidencePack(noEvidence);
    assert.equal(noProof.ok, false);
    assert.ok(noProof.errors.some((e) => e.includes("no proof, no success")));
  });

  await t.test("4. dry_run cannot claim real file changes", () => {
    const lyingDryRun = probePack({
      mode: "dry_run",
      outcome: "dry_run_completed",
      filesTouched: ["src/example.ts"],
    });
    const result = validateRuntimeEvidencePack(lyingDryRun);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("cannot claim touched files")));

    const lyingStatus = probePack({
      mode: "dry_run",
      outcome: "dry_run_completed",
      repoStatusAfter: "1 file modified",
    });
    assert.equal(validateRuntimeEvidencePack(lyingStatus).ok, false);

    const honest = probePack({ mode: "dry_run", outcome: "dry_run_completed" });
    assert.deepEqual(validateRuntimeEvidencePack(honest), { ok: true });
  });

  await t.test("5. a probe pack can never enable dispatch", () => {
    const hijacked = probePack({ enablesDispatch: true });
    const result = validateRuntimeEvidencePack(hijacked);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("enablesDispatch")));
    // A probe claiming execution outcomes is also rejected.
    assert.equal(validateRuntimeEvidencePack(probePack({ outcome: "execution_success" })).ok, false);
  });

  await t.test("6. ledgerRequired is the literal true", () => {
    const optedOut = probePack({ ledgerRequired: false });
    const result = validateRuntimeEvidencePack(optedOut);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("Ledger has no opt-out")));
  });

  await t.test("7. sentinelle is required for execution", () => {
    const ungated = executionPack({ sentinelleDecision: null });
    const result = validateRuntimeEvidencePack(ungated);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("no gate, no execution")));

    const unapproved = executionPack({
      sentinelleDecision: {
        zone: "yellow",
        approved: false,
        approvalReference: "n/a",
        decidedAtIso: NOW,
      },
      outcome: "execution_failed",
      validationSummary: { status: "failed", detail: "blocked" },
    });
    assert.equal(validateRuntimeEvidencePack(unapproved).ok, false);

    const noReference = executionPack({
      sentinelleDecision: { zone: "yellow", approved: true, approvalReference: "", decidedAtIso: NOW },
    });
    assert.equal(validateRuntimeEvidencePack(noReference).ok, false);
  });

  await t.test("8. runtimeId must map to a known runtime kind", () => {
    const mismatched = probePack({ runtimeId: "mystery-engine-01" });
    const result = validateRuntimeEvidencePack(mismatched);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("runtimeId")));

    const unknownKind = probePack({ runtimeKind: "grok_cli" });
    assert.equal(validateRuntimeEvidencePack(unknownKind).ok, false);
  });

  await t.test("9. unknown tools are denied by default", () => {
    const pack = probePack({ allowedTools: ["read_file"], deniedTools: ["run_shell"] });
    assert.equal(isRuntimeToolPermitted(pack, "read_file").permitted, true);
    assert.equal(isRuntimeToolPermitted(pack, "run_shell").permitted, false);
    const unknown = isRuntimeToolPermitted(pack, "delete_everything");
    assert.equal(unknown.permitted, false);
    assert.ok(unknown.reason.includes("denied by default"));
    // deniedTools wins even when a tool is also allowlisted.
    const both = probePack({ allowedTools: ["run_shell"], deniedTools: ["run_shell"] });
    assert.equal(isRuntimeToolPermitted(both, "run_shell").permitted, false);
  });

  await t.test("10. nextAction is a closed enum", () => {
    for (const verb of ["approve", "reject", "fix", "park", "merge_manually", "retry"]) {
      assert.deepEqual(validateRuntimeEvidencePack(probePack({ nextAction: verb })), { ok: true });
    }
    const freestyle = validateRuntimeEvidencePack(probePack({ nextAction: "yolo_merge" }));
    assert.equal(freestyle.ok, false);
    assert.ok(freestyle.errors.some((e) => e.includes("closed verb set")));
  });

  await t.test("11. tenant/customer exposure is rejected", () => {
    const exposed = probePack({ exposure: "workspace_shared" });
    const result = validateRuntimeEvidencePack(exposed);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("never serve tenants")));

    const tenantField = probePack({ tenant: "acme-corp" });
    assert.equal(validateRuntimeEvidencePack(tenantField).ok, false);
  });

  await t.test("12. pack size is bounded", () => {
    const bloated = probePack({
      repoStatusBefore: "x".repeat(MAX_PACK_JSON_CHARS),
      repoStatusAfter: "x".repeat(MAX_PACK_JSON_CHARS),
    });
    const result = validateRuntimeEvidencePack(bloated);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("log dump is not evidence")));

    const tooManyItems = probePack({
      evidenceItems: Array.from({ length: 60 }, () => evidenceItem()),
    });
    assert.equal(validateRuntimeEvidencePack(tooManyItems).ok, false);
  });
});
