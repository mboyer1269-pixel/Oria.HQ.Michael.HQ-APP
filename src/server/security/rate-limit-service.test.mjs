#!/usr/bin/env node
/**
 * Local rate-limit unit checks (no Supabase).
 * Uses the dev-only local event log — not an in-memory Map source of truth for production.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const {
  CONTACT_POST_RATE_LIMIT_SCOPE,
  enforceSharedRateLimit,
  getRequestClientIp,
  resetLocalRateLimitEventsForTests,
} = await jiti.import(path.join(projectRoot, "src/server/security/rate-limit-service.ts"));

test("getRequestClientIp prefers the first x-forwarded-for address", () => {
  const request = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.10, 198.51.100.2" },
  });

  assert.equal(getRequestClientIp(request), "203.0.113.10");
});

test("enforceSharedRateLimit blocks after maxAttempts in local fallback mode", async () => {
  resetLocalRateLimitEventsForTests();

  const scope = CONTACT_POST_RATE_LIMIT_SCOPE;
  const bucketKey = `test-${Date.now()}`;
  const config = { maxAttempts: 2, windowSeconds: 60 };
  const now = new Date("2026-05-22T12:00:00.000Z");

  const first = await enforceSharedRateLimit({ scope, bucketKey, config, now });
  const second = await enforceSharedRateLimit({
    scope,
    bucketKey,
    config,
    now: new Date(now.getTime() + 1_000),
  });
  const third = await enforceSharedRateLimit({
    scope,
    bucketKey,
    config,
    now: new Date(now.getTime() + 2_000),
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  if (!third.allowed) {
    assert.ok(third.retryAfterSeconds > 0);
  }
});
