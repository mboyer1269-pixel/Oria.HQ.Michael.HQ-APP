#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

test("Local Subscription Runtime Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "local-runtime-contract.ts"));
  const {
    KNOWN_LOCAL_RUNTIME_CAPABILITIES,
    validateLocalRuntimeCapability,
    validateLocalRuntimeAuth,
    validateLocalRuntimeProbeResult,
    validateLocalRuntimeInvocationPolicy,
    validateLocalRuntimeSafetyBoundary,
  } = mod;

  const validProbe = {
    kind: "claude_code_cli",
    probedAtIso: "2026-07-02T12:00:00.000Z",
    binaryDetected: true,
    version: "2.1.0",
    authMode: "account_login",
    available: true,
  };

  const validPolicy = {
    kind: "claude_code_cli",
    exposure: "personal_local",
    auth: { mode: "account_login", exposure: "personal_local" },
    permissionMode: "default",
    sentinelle: { defaultZone: "yellow", requiresApprovalForToolUse: true },
    sentinelleRequired: true,
    ledgerRequired: true,
    subprocess: { status: "future_pr" },
    output: { format: "structured_json", schemaRequired: true },
  };

  const validBoundary = {
    forbiddenAuthChannels: [
      "cookie",
      "session_token",
      "browser_scrape",
      "reverse_proxy",
      "oauth_interception",
    ],
    cookieAuthForbidden: true,
    sessionTokenAuthForbidden: true,
    browserScrapingForbidden: true,
    reverseProxyForbidden: true,
    tenantExposureForbidden: true,
  };

  await t.test("the known capability catalog validates and covers both runtimes", () => {
    assert.deepEqual(
      KNOWN_LOCAL_RUNTIME_CAPABILITIES.map((c) => c.kind).sort(),
      ["claude_code_cli", "codex_cli"],
    );
    for (const capability of KNOWN_LOCAL_RUNTIME_CAPABILITIES) {
      assert.deepEqual(validateLocalRuntimeCapability(capability), { ok: true });
    }
  });

  await t.test("a binary name that smuggles a path or command line is rejected", () => {
    const smuggled = validateLocalRuntimeCapability({
      ...KNOWN_LOCAL_RUNTIME_CAPABILITIES[0],
      binaryName: "claude && rm -rf /",
    });
    assert.equal(smuggled.ok, false);
    assert.match(smuggled.errors.join(" "), /plain binary name/);
  });

  await t.test("invariant 1: a local runtime is never assumed available", () => {
    assert.deepEqual(validateLocalRuntimeProbeResult(validProbe), { ok: true });

    const assumed = validateLocalRuntimeProbeResult({
      ...validProbe,
      binaryDetected: false,
    });
    assert.equal(assumed.ok, false);
    assert.match(assumed.errors.join(" "), /never assumed available/);

    const unknownAuth = validateLocalRuntimeProbeResult({
      ...validProbe,
      authMode: "unknown",
    });
    assert.equal(unknownAuth.ok, false);
    assert.match(unknownAuth.errors.join(" "), /finding, not a basis for invocation/);

    const noEvidence = validateLocalRuntimeProbeResult({
      ...validProbe,
      probedAtIso: "not-a-date",
    });
    assert.equal(noEvidence.ok, false);
    assert.match(noEvidence.errors.join(" "), /availability without evidence is void/i);

    // An unavailable probe finding is a perfectly valid piece of evidence.
    const honestMiss = validateLocalRuntimeProbeResult({
      ...validProbe,
      binaryDetected: false,
      version: null,
      authMode: "unknown",
      available: false,
    });
    assert.deepEqual(honestMiss, { ok: true });
  });

  await t.test("invariant 2: account_login is permitted only for personal_local exposure", () => {
    assert.deepEqual(
      validateLocalRuntimeAuth("claude_code_cli", {
        mode: "account_login",
        exposure: "personal_local",
      }),
      { ok: true },
    );

    const tenantFacing = validateLocalRuntimeAuth("claude_code_cli", {
      mode: "account_login",
      exposure: "workspace_tenants",
    });
    assert.equal(tenantFacing.ok, false);
    assert.match(tenantFacing.errors.join(" "), /never serves tenants/);
  });

  await t.test("invariant 3: an api key is an env var NAME, never a value", () => {
    assert.deepEqual(
      validateLocalRuntimeAuth("codex_cli", { mode: "api_key", apiKeyEnvVar: "OPENAI_API_KEY" }),
      { ok: true },
    );

    for (const leaked of ["sk-proj-abc123def456", "Bearer eyJhbGciOi", "", "A".repeat(65)]) {
      const result = validateLocalRuntimeAuth("codex_cli", {
        mode: "api_key",
        apiKeyEnvVar: leaked,
      });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /environment variable NAME/);
    }
  });

  await t.test("invariants 4-6: cookie, session token, scraping, and proxy channels are inexpressible", () => {
    for (const channel of [
      "cookie",
      "session_token",
      "browser_scrape",
      "reverse_proxy",
      "oauth_interception",
    ]) {
      const result = validateLocalRuntimeAuth("claude_code_cli", { mode: channel });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /permanently forbidden/);
    }
  });

  await t.test("a well-formed invocation policy validates", () => {
    assert.deepEqual(validateLocalRuntimeInvocationPolicy(validPolicy), { ok: true });
  });

  await t.test("invariant 7: invocation requires Sentinelle", () => {
    const noGate = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      sentinelle: undefined,
    });
    assert.equal(noGate.ok, false);
    assert.match(noGate.errors.join(" "), /defaultZone must be/);

    const optedOut = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      sentinelleRequired: false,
    });
    assert.equal(optedOut.ok, false);
    assert.match(optedOut.errors.join(" "), /no gate, no runtime/);
  });

  await t.test("invariant 8: the Ledger has no opt-out", () => {
    const noLedger = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      ledgerRequired: false,
    });
    assert.equal(noLedger.ok, false);
    assert.match(noLedger.errors.join(" "), /Ledger has no opt-out/);
  });

  await t.test("invariant 9: dangerous permission modes are rejected by default", () => {
    for (const mode of [
      "bypass_permissions",
      "dangerously_skip_permissions",
      "yolo",
      "full_auto",
      "full_access",
      "no_sandbox",
    ]) {
      const result = validateLocalRuntimeInvocationPolicy({
        ...validPolicy,
        permissionMode: mode,
      });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /dangerous and\s+rejected by default/);
    }

    const merelyUnknown = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      permissionMode: "creative_mode",
    });
    assert.equal(merelyUnknown.ok, false);
    assert.match(merelyUnknown.errors.join(" "), /unknown permission mode/);
  });

  await t.test("invariant 10: output must be structured or marked untrusted", () => {
    assert.deepEqual(
      validateLocalRuntimeInvocationPolicy({
        ...validPolicy,
        output: { format: "raw_text", treatAsUntrusted: true },
      }),
      { ok: true },
    );

    const trustedRawText = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      output: { format: "raw_text", treatAsUntrusted: false },
    });
    assert.equal(trustedRawText.ok, false);
    assert.match(trustedRawText.errors.join(" "), /prompt-injection surface/);

    const schemaless = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      output: { format: "structured_json", schemaRequired: false },
    });
    assert.equal(schemaless.ok, false);
    assert.match(schemaless.errors.join(" "), /schemaRequired/);
  });

  await t.test("invariant 11: subprocess execution stays future_pr unless approved in writing", () => {
    const bareApproval = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      subprocess: { status: "approved", approvalReference: "" },
    });
    assert.equal(bareApproval.ok, false);
    assert.match(bareApproval.errors.join(" "), /without a trace is not approved/);

    const writtenApproval = validateLocalRuntimeInvocationPolicy({
      ...validPolicy,
      subprocess: {
        status: "approved",
        approvalReference: "CEO mandate 2026-07-02: probe-only subprocess",
      },
    });
    assert.deepEqual(writtenApproval, { ok: true });
  });

  await t.test("invariant 12: a personal runtime is never exposed to tenants or customers", () => {
    for (const exposure of ["workspace_tenants", "customers", "public_api", ""]) {
      const result = validateLocalRuntimeInvocationPolicy({
        ...validPolicy,
        exposure,
        auth: { mode: "account_login", exposure },
      });
      assert.equal(result.ok, false);
      assert.match(result.errors.join(" "), /never exposed to workspaces, tenants, or customers/);
    }
  });

  await t.test("the safety boundary must cover the complete forbidden-channel list", () => {
    assert.deepEqual(validateLocalRuntimeSafetyBoundary(validBoundary), { ok: true });

    const partialBan = validateLocalRuntimeSafetyBoundary({
      ...validBoundary,
      forbiddenAuthChannels: ["cookie", "session_token"],
    });
    assert.equal(partialBan.ok, false);
    assert.match(partialBan.errors.join(" "), /complete or it is nothing/);

    const softenedFlag = validateLocalRuntimeSafetyBoundary({
      ...validBoundary,
      reverseProxyForbidden: false,
    });
    assert.equal(softenedFlag.ok, false);
    assert.match(softenedFlag.errors.join(" "), /reverseProxyForbidden must be true/);
  });
});
