#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const userContextPath = path.join(projectRoot, "src/server/auth/user-context.ts");

async function importUserContext() {
  const { createJiti } = await import("jiti");
  // moduleCache/fsCache off so each import re-evaluates server-env against the
  // process.env set by the current test (otherwise the first load is reused).
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    fsCache: false,
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });
  return jiti.import(userContextPath);
}

// Restore mutated env after the file so we never leak state to other suites.
const ENV_KEYS = ["NODE_ENV", "ORIA_ALLOW_DEV_USER_FALLBACK", "MICHAEL_HQ_OWNER_ID", "MICHAEL_HQ_OWNER_EMAIL"];
const SAVED = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

test.after(() => {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

test("dev fallback: no owner id resolves to the local single-user identity", async () => {
  process.env.NODE_ENV = "development";
  delete process.env.MICHAEL_HQ_OWNER_ID;
  delete process.env.MICHAEL_HQ_OWNER_EMAIL;
  delete process.env.ORIA_ALLOW_DEV_USER_FALLBACK;

  const { getServerUserContext } = await importUserContext();
  const ctx = getServerUserContext();

  assert.equal(ctx.userId, "local-michael");
  assert.equal(ctx.storagePreference, "local");
});

test("real owner id resolves to the Supabase-backed identity", async () => {
  process.env.NODE_ENV = "development";
  process.env.MICHAEL_HQ_OWNER_ID = "00000000-0000-4000-8000-000000000000";
  process.env.MICHAEL_HQ_OWNER_EMAIL = "owner@example.com";

  const { getServerUserContext } = await importUserContext();
  const ctx = getServerUserContext();

  assert.equal(ctx.userId, "00000000-0000-4000-8000-000000000000");
  assert.equal(ctx.storagePreference, "supabase");
  assert.equal(ctx.email, "owner@example.com");
});

test("dev fallback guard: production fail-closes unless explicitly opted in", async () => {
  // Load in development so module init does not fail fast, then exercise the
  // guard, which reads process.env live at call time.
  process.env.NODE_ENV = "development";
  delete process.env.MICHAEL_HQ_OWNER_ID;
  const { isDevUserFallbackAllowed } = await importUserContext();

  // Non-production: always allowed (local ergonomics).
  process.env.NODE_ENV = "development";
  delete process.env.ORIA_ALLOW_DEV_USER_FALLBACK;
  assert.equal(isDevUserFallbackAllowed(), true);

  // Production, no opt-in: fail-closed.
  process.env.NODE_ENV = "production";
  delete process.env.ORIA_ALLOW_DEV_USER_FALLBACK;
  assert.equal(isDevUserFallbackAllowed(), false);

  // Production, explicit opt-in: allowed.
  process.env.ORIA_ALLOW_DEV_USER_FALLBACK = "true";
  assert.equal(isDevUserFallbackAllowed(), true);

  // Production, any value other than "true": still fail-closed.
  process.env.ORIA_ALLOW_DEV_USER_FALLBACK = "1";
  assert.equal(isDevUserFallbackAllowed(), false);
});
