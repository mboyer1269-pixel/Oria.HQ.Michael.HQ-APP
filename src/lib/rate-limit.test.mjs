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

const {
  getRateLimitBackend,
  getRateLimitDiagnostics,
  isAllowed,
  isAllowedForPolicy,
  rateLimitKey,
  RATE_LIMIT_POLICIES,
  __resetRateLimitersForTests,
} = await import("./rate-limit.ts");

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

// ---------------------------------------------------------------------------
// Isolation by policy — the ordering bug, asserted in BOTH directions
// ---------------------------------------------------------------------------
//
// The Upstash limiter used to be a single cached instance built from whichever
// call site ran first after a cold start. Every later caller's limit and window
// were silently discarded. Which policy leaked depended on request order, so
// the same deployment could be over-throttled or under-protected on different
// days, with no code change between them.

/**
 * Records every limiter construction and answers `success` from a per-limiter
 * counter, so a test can see BOTH which configuration was built and which
 * configuration a given call was actually judged against.
 */
function installLimiterSpy() {
  const built = [];
  globalThis.__rateLimitLimiterFactoryForTests = (limit, windowMs) => {
    const seen = new Map();
    const record = { limit, windowMs, calls: [] };
    built.push(record);
    return {
      async limit(key) {
        record.calls.push(key);
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        return { success: count <= limit };
      },
    };
  };
  __resetRateLimitersForTests();
  return {
    built,
    restore() {
      delete globalThis.__rateLimitLimiterFactoryForTests;
      __resetRateLimitersForTests();
    },
  };
}

const UPSTASH_ON = {
  [URL_VAR]: "https://example.upstash.io",
  [TOKEN_VAR]: "test-token",
  NODE_ENV: "production",
};

test("contact-first: the n8n dispatch does not inherit the contact form's window", async () => {
  await withEnv(UPSTASH_ON, async () => {
    const spy = installLimiterSpy();
    try {
      await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, "1.2.3.4");
      await isAllowedForPolicy(RATE_LIMIT_POLICIES.n8n_dispatch, "ws:agent");

      assert.equal(spy.built.length, 2, "one limiter per policy, not one per process");

      const n8n = spy.built.find((b) => b.limit === RATE_LIMIT_POLICIES.n8n_dispatch.limit);
      assert.ok(
        n8n,
        "the n8n dispatch inherited the contact form's limiter — it would be " +
          "throttled to 5 per hour instead of 30 per minute",
      );
      assert.equal(n8n.windowMs, RATE_LIMIT_POLICIES.n8n_dispatch.windowMs);
    } finally {
      spy.restore();
    }
  });
});

test("n8n-first: the public contact form does not inherit the dispatch's limit", async () => {
  await withEnv(UPSTASH_ON, async () => {
    const spy = installLimiterSpy();
    try {
      // The dangerous ordering. Under the old singleton the contact form became
      // 30-per-minute — six times more permissive per minute than designed, on a
      // surface anyone on the internet can reach.
      await isAllowedForPolicy(RATE_LIMIT_POLICIES.n8n_dispatch, "ws:agent");
      await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, "1.2.3.4");

      assert.equal(spy.built.length, 2);

      const contact = spy.built.find(
        (b) => b.limit === RATE_LIMIT_POLICIES.contact_form.limit,
      );
      assert.ok(
        contact,
        "the public contact form inherited the n8n dispatch's limiter — it would " +
          "allow 30 submissions per minute instead of 5 per hour",
      );
      assert.equal(contact.windowMs, RATE_LIMIT_POLICIES.contact_form.windowMs);
    } finally {
      spy.restore();
    }
  });
});

test("the contact form is still enforced at its own limit after the dispatch ran", async () => {
  // The property a caller cares about, not just the construction shape:
  // exhausting the contact policy takes exactly its own budget.
  await withEnv(UPSTASH_ON, async () => {
    const spy = installLimiterSpy();
    try {
      await isAllowedForPolicy(RATE_LIMIT_POLICIES.n8n_dispatch, "ws:agent");

      const { limit } = RATE_LIMIT_POLICIES.contact_form;
      for (let i = 0; i < limit; i += 1) {
        assert.equal(
          await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, "1.2.3.4"),
          true,
          `request ${i + 1} of ${limit} must be allowed`,
        );
      }
      assert.equal(
        await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, "1.2.3.4"),
        false,
        "request beyond the contact policy's own limit must be blocked",
      );
    } finally {
      spy.restore();
    }
  });
});

test("two policies never share a counter, even for an identical subject", async () => {
  await withEnv(
    { [URL_VAR]: undefined, [TOKEN_VAR]: undefined, NODE_ENV: "test" },
    async () => {
      // Same subject string on both surfaces. Without namespacing they would
      // consume each other's budget in the in-memory store too.
      const subject = "same-subject-" + Math.random().toString(36).slice(2);

      const contactKey = rateLimitKey(RATE_LIMIT_POLICIES.contact_form, subject);
      const n8nKey = rateLimitKey(RATE_LIMIT_POLICIES.n8n_dispatch, subject);
      assert.notEqual(contactKey, n8nKey);

      const { limit } = RATE_LIMIT_POLICIES.contact_form;
      for (let i = 0; i < limit; i += 1) {
        assert.equal(await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, subject), true);
      }
      assert.equal(await isAllowedForPolicy(RATE_LIMIT_POLICIES.contact_form, subject), false);

      assert.equal(
        await isAllowedForPolicy(RATE_LIMIT_POLICIES.n8n_dispatch, subject),
        true,
        "the n8n policy must have its own budget for the same subject",
      );
    },
  );
});

test("every policy is registered under its own id, with sane numbers", () => {
  for (const [id, policy] of Object.entries(RATE_LIMIT_POLICIES)) {
    assert.equal(policy.id, id, "the registry key and the policy id must agree");
    assert.ok(policy.limit > 0, `${id}: limit must be positive`);
    assert.ok(policy.windowMs > 0, `${id}: window must be positive`);
    assert.ok(policy.description.trim().length > 20, `${id}: must explain its numbers`);
  }
});
