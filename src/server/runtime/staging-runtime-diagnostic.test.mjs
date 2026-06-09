/**
 * staging-runtime-diagnostic.test.mjs
 *
 * The staging runtime diagnostic must be fail-closed (blocked in production and
 * when the enable flag is off), must correctly classify the Supabase project
 * ref, and must NEVER include a secret value in its payload.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const {
  STAGING_RUNTIME_DIAGNOSTIC_ENV,
  EXPECTED_STAGING_REF,
  KNOWN_PROD_REF,
  WARN_POINTS_TO_PROD,
  WARN_NOT_STAGING,
  WARN_URL_MISSING,
  isStagingRuntimeDiagnosticEnabled,
  isProductionRuntime,
  extractSupabaseProjectRef,
  extractHost,
  evaluateStagingRuntimeAccess,
  buildStagingRuntimeDiagnostic,
} = await import("./staging-runtime-diagnostic.ts");

const STAGING_URL = `https://${EXPECTED_STAGING_REF}.supabase.co`;
const PROD_URL = `https://${KNOWN_PROD_REF}.supabase.co`;

// A representative secret-bearing env pointed at staging, diagnostic enabled.
function stagingEnabledEnv(overrides = {}) {
  return {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "staging",
    NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key-SHOULD-NEVER-APPEAR-aaaaaaaaaaaa",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-SHOULD-NEVER-APPEAR-bbbbbbbb",
    LEDGER_HMAC_KEY: "hmac-SHOULD-NEVER-APPEAR-cccccccccccccccccccc",
    [STAGING_RUNTIME_DIAGNOSTIC_ENV]: "true",
    ...overrides,
  };
}

// --- 1. production returns blocked -----------------------------------------
test("blocked in production even when the diagnostic flag is on", () => {
  const access = evaluateStagingRuntimeAccess(
    stagingEnabledEnv({ VERCEL_ENV: "production" }),
  );
  assert.equal(access.allowed, false);
  assert.equal(access.status, 404);
  assert.equal(access.reason, "blocked_production");
});

test("blocked when NODE_ENV=production and VERCEL_ENV is absent", () => {
  assert.equal(isProductionRuntime({ NODE_ENV: "production" }), true);
  const access = evaluateStagingRuntimeAccess({
    NODE_ENV: "production",
    [STAGING_RUNTIME_DIAGNOSTIC_ENV]: "true",
  });
  assert.equal(access.allowed, false);
  assert.equal(access.reason, "blocked_production");
});

// --- 2. diagnostic disabled returns blocked --------------------------------
test("blocked in preview when the enable flag is absent", () => {
  const env = stagingEnabledEnv();
  delete env[STAGING_RUNTIME_DIAGNOSTIC_ENV];
  const access = evaluateStagingRuntimeAccess(env);
  assert.equal(access.allowed, false);
  assert.equal(access.status, 404);
  assert.equal(access.reason, "blocked_disabled");
});

test("allowed only in non-production with an explicitly truthy flag", () => {
  const access = evaluateStagingRuntimeAccess(stagingEnabledEnv());
  assert.equal(access.allowed, true);
  assert.equal(access.status, 200);
  assert.equal(access.reason, "ok");
});

// --- 6. flags parse fail-safe OFF by default -------------------------------
test("enable flag is OFF for absent / empty / unknown / falsey values", () => {
  for (const v of [undefined, "", "0", "false", "off", "no", " ", "maybe"]) {
    const env = v === undefined ? {} : { [STAGING_RUNTIME_DIAGNOSTIC_ENV]: v };
    assert.equal(isStagingRuntimeDiagnosticEnabled(env), false, JSON.stringify(v));
  }
});

test("enable flag is ON only for recognized truthy values (case/space-insensitive)", () => {
  for (const v of ["1", "true", "on", "yes", "TRUE", " On ", "YES"]) {
    assert.equal(isStagingRuntimeDiagnosticEnabled({ [STAGING_RUNTIME_DIAGNOSTIC_ENV]: v }), true, v);
  }
});

// --- ref extraction --------------------------------------------------------
test("extractSupabaseProjectRef pulls the leftmost host label of a supabase URL", () => {
  assert.equal(extractSupabaseProjectRef(STAGING_URL), EXPECTED_STAGING_REF);
  assert.equal(extractSupabaseProjectRef(PROD_URL), KNOWN_PROD_REF);
  assert.equal(extractHost(STAGING_URL), `${EXPECTED_STAGING_REF}.supabase.co`);
});

test("extractSupabaseProjectRef returns null for absent / malformed / non-supabase URLs", () => {
  for (const v of [undefined, "", "   ", "not a url", "https://example.com"]) {
    assert.equal(extractSupabaseProjectRef(v), null, JSON.stringify(v));
  }
});

// --- 3. staging ref detected -----------------------------------------------
test("staging ref detected: points to expected staging, no ref warnings", () => {
  const d = buildStagingRuntimeDiagnostic(stagingEnabledEnv());
  assert.equal(d.supabaseProjectRef, EXPECTED_STAGING_REF);
  assert.equal(d.supabaseUrlHost, `${EXPECTED_STAGING_REF}.supabase.co`);
  assert.equal(d.pointsToExpectedStaging, true);
  assert.equal(d.pointsToKnownProd, false);
  assert.deepEqual(d.warnings, []);
  assert.equal(d.envName, "preview");
  assert.equal(d.gitBranch, "staging");
});

// --- 4. prod ref warning detected ------------------------------------------
test("prod ref warning detected: STOP_PREVIEW_POINTS_TO_PROD + not-staging", () => {
  const d = buildStagingRuntimeDiagnostic(
    stagingEnabledEnv({ NEXT_PUBLIC_SUPABASE_URL: PROD_URL }),
  );
  assert.equal(d.supabaseProjectRef, KNOWN_PROD_REF);
  assert.equal(d.pointsToKnownProd, true);
  assert.equal(d.pointsToExpectedStaging, false);
  assert.ok(d.warnings.includes(WARN_POINTS_TO_PROD));
  assert.ok(d.warnings.includes(WARN_NOT_STAGING));
});

test("missing Supabase URL warns URL_MISSING + not-staging and yields null fingerprints", () => {
  const env = stagingEnabledEnv();
  delete env.NEXT_PUBLIC_SUPABASE_URL;
  const d = buildStagingRuntimeDiagnostic(env);
  assert.equal(d.supabaseUrlHost, null);
  assert.equal(d.supabaseProjectRef, null);
  assert.ok(d.warnings.includes(WARN_URL_MISSING));
  assert.ok(d.warnings.includes(WARN_NOT_STAGING));
  assert.equal(d.warnings.includes(WARN_POINTS_TO_PROD), false);
});

// --- presence booleans reflect env without leaking -------------------------
test("presence booleans are true when secrets are set, false when absent", () => {
  const present = buildStagingRuntimeDiagnostic(stagingEnabledEnv());
  assert.equal(present.serviceRolePresent, true);
  assert.equal(present.anonKeyPresent, true);
  assert.equal(present.ledgerHmacKeyPresent, true);

  const bare = buildStagingRuntimeDiagnostic({
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    [STAGING_RUNTIME_DIAGNOSTIC_ENV]: "true",
  });
  assert.equal(bare.serviceRolePresent, false);
  assert.equal(bare.anonKeyPresent, false);
  assert.equal(bare.ledgerHmacKeyPresent, false);
});

test("feature flags default OFF and reflect explicit truthy values", () => {
  const off = buildStagingRuntimeDiagnostic(stagingEnabledEnv());
  assert.equal(off.missionDurableDraftsEnabled, false);
  assert.equal(off.ledgerHashChainWriteEnabled, false);

  const on = buildStagingRuntimeDiagnostic(
    stagingEnabledEnv({ MISSION_DURABLE_DRAFTS: "true", LEDGER_HASH_CHAIN_WRITE: "1" }),
  );
  assert.equal(on.missionDurableDraftsEnabled, true);
  assert.equal(on.ledgerHashChainWriteEnabled, true);
});

// --- 5. secrets are not included in response -------------------------------
test("secrets never appear anywhere in the serialized diagnostic payload", () => {
  const env = stagingEnabledEnv({
    MISSION_DURABLE_DRAFTS: "true",
    LEDGER_HASH_CHAIN_WRITE: "true",
  });
  const serialized = JSON.stringify(buildStagingRuntimeDiagnostic(env));

  for (const secret of [
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.LEDGER_HMAC_KEY,
  ]) {
    assert.equal(serialized.includes(secret), false, `leaked: ${secret}`);
  }
  // Guard against substrings of the known secret markers leaking too.
  assert.equal(serialized.includes("SHOULD-NEVER-APPEAR"), false);
});
