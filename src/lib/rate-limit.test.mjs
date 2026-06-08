/**
 * rate-limit.test.mjs
 *
 * Guards the production-safety contract of the adaptive rate limiter:
 *   - Upstash env present            -> "upstash" backend, multi-instance safe
 *   - Upstash absent outside prod    -> "memory" fallback, no risk flagged
 *   - Upstash absent in production   -> "memory" fallback, productionFallbackRisk
 *   - Partial Upstash config         -> treated as "memory" (both vars required)
 *   - In-memory limiter functional   -> allows up to `limit`, then blocks
 *
 * The Upstash-backend cases assert backend SELECTION only — they never call
 * isAllowed() in upstash mode, so no Redis connection is attempted.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const { getRateLimitBackend, getRateLimitDiagnostics, isAllowed } =
  await import("./rate-limit.ts");

const URL_VAR = "UPSTASH_REDIS_REST_URL";
const TOKEN_VAR = "UPSTASH_REDIS_REST_TOKEN";

/** Runs `fn` with the given env overrides, restoring prior values afterwards. */
async function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test("backend = upstash when both Upstash env vars are set", async () => {
  await withEnv(
    {
      [URL_VAR]: "https://example.upstash.io",
      [TOKEN_VAR]: "test-token",
      NODE_ENV: "production",
    },
    () => {
      const diag = getRateLimitDiagnostics();
      assert.equal(getRateLimitBackend(), "upstash");
      assert.equal(diag.backend, "upstash");
      assert.equal(diag.multiInstanceSafe, true);
      assert.equal(diag.productionFallbackRisk, false);
    },
  );
});

test("backend = memory with no risk when Upstash absent outside production", async () => {
  await withEnv(
    { [URL_VAR]: undefined, [TOKEN_VAR]: undefined, NODE_ENV: "development" },
    () => {
      const diag = getRateLimitDiagnostics();
      assert.equal(diag.backend, "memory");
      assert.equal(diag.multiInstanceSafe, false);
      assert.equal(diag.productionFallbackRisk, false);
    },
  );
});

test("productionFallbackRisk is true when Upstash absent in production", async () => {
  await withEnv(
    { [URL_VAR]: undefined, [TOKEN_VAR]: undefined, NODE_ENV: "production" },
    () => {
      const diag = getRateLimitDiagnostics();
      assert.equal(diag.backend, "memory");
      assert.equal(diag.productionFallbackRisk, true);
    },
  );
});

test("partial Upstash config (url only) is treated as the memory backend", async () => {
  await withEnv(
    {
      [URL_VAR]: "https://example.upstash.io",
      [TOKEN_VAR]: undefined,
      NODE_ENV: "production",
    },
    () => {
      assert.equal(getRateLimitBackend(), "memory");
      assert.equal(getRateLimitDiagnostics().productionFallbackRisk, true);
    },
  );
});

test("in-memory limiter allows up to limit then blocks within the window", async () => {
  await withEnv(
    { [URL_VAR]: undefined, [TOKEN_VAR]: undefined, NODE_ENV: "test" },
    async () => {
      const key = "test-ip-" + Math.random().toString(36).slice(2);
      const limit = 2;
      const windowMs = 10_000;
      assert.equal(await isAllowed(key, limit, windowMs), true); // 1st
      assert.equal(await isAllowed(key, limit, windowMs), true); // 2nd
      assert.equal(await isAllowed(key, limit, windowMs), false); // 3rd -> blocked
    },
  );
});
