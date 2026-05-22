#!/usr/bin/env node
/**
 * Local rate-limit unit checks (no Supabase).
 * Uses the dev-only local event log — not an in-memory Map source of truth for production.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

delete process.env.MICHAEL_HQ_OWNER_ID;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.VERCEL;

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const servicePath = path.join(projectRoot, "src/server/security/rate-limit-service.ts");
const {
  CONTACT_POST_RATE_LIMIT_SCOPE,
  buildPrivacySafeRateLimitBucketKey,
  enforceSharedRateLimit,
  getRequestClientIdentifier,
  resetLocalRateLimitEventsForTests,
} = await jiti.import(pathToFileURL(servicePath).href);

test("buildPrivacySafeRateLimitBucketKey never stores raw IP", () => {
  const rawIp = "203.0.113.10";
  const bucketKey = buildPrivacySafeRateLimitBucketKey(CONTACT_POST_RATE_LIMIT_SCOPE, rawIp);

  assert.notEqual(bucketKey, rawIp);
  assert.match(bucketKey, /^[a-f0-9]{64}$/);
});

test("getRequestClientIdentifier ignores spoofed x-forwarded-for outside trusted proxy context", () => {
  const request = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.10, 198.51.100.2" },
  });

  assert.equal(getRequestClientIdentifier(request), "untrusted-proxy");
});

test("getRequestClientIdentifier ignores spoofed x-real-ip outside trusted proxy context", () => {
  const request = new Request("https://example.com", {
    headers: { "x-real-ip": "203.0.113.10" },
  });

  assert.equal(getRequestClientIdentifier(request), "untrusted-proxy");
});

test("getRequestClientIdentifier returns unknown when no proxy headers outside trusted context", () => {
  const request = new Request("https://example.com");

  assert.equal(getRequestClientIdentifier(request), "unknown");
});

test("getRequestClientIdentifier uses x-forwarded-for only on trusted Vercel proxy context", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "203.0.113.10, 198.51.100.2" },
    });

    assert.equal(getRequestClientIdentifier(request), "203.0.113.10");
  } finally {
    if (previous === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previous;
    }
  }
});

test("getRequestClientIdentifier uses x-real-ip on trusted Vercel proxy context", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const request = new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.10" },
    });

    assert.equal(getRequestClientIdentifier(request), "203.0.113.10");
  } finally {
    if (previous === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previous;
    }
  }
});

test("getRequestClientIdentifier prefers x-real-ip over x-forwarded-for on trusted proxy context", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const request = new Request("https://example.com", {
      headers: {
        "x-real-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.2, 192.0.2.1",
      },
    });

    assert.equal(getRequestClientIdentifier(request), "203.0.113.10");
  } finally {
    if (previous === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previous;
    }
  }
});

test("getRequestClientIdentifier rejects malformed forwarded header values on trusted proxy", () => {
  const previous = process.env.VERCEL;
  process.env.VERCEL = "1";

  try {
    const request = new Request("https://example.com", {
      headers: { "x-forwarded-for": "not-an-ip, also-bad" },
    });

    assert.equal(getRequestClientIdentifier(request), "unknown");
  } finally {
    if (previous === undefined) {
      delete process.env.VERCEL;
    } else {
      process.env.VERCEL = previous;
    }
  }
});

test("enforceSharedRateLimit blocks after maxAttempts in local fallback mode", async () => {
  resetLocalRateLimitEventsForTests();

  const scope = CONTACT_POST_RATE_LIMIT_SCOPE;
  const bucketKey = buildPrivacySafeRateLimitBucketKey(scope, `test-${Date.now()}`);
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
