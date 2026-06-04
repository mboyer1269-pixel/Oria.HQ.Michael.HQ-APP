#!/usr/bin/env node

// src/server/outbound/outbound-types.test.mjs
//
// Pure unit tests for outbound type contracts.
// No DB, no network, no side effects.

import assert from "node:assert/strict";
import test from "node:test";

// ---------------------------------------------------------------------------
// Import the compiled module via TypeScript strip-types
// ---------------------------------------------------------------------------

const {
  isBatchTransitionAllowed,
  isActionTransitionAllowed,
  buildContentHashInput,
  buildActionIdempotencyKey,
  BATCH_TRANSITIONS,
  ACTION_TRANSITIONS,
} = await import("./outbound-types.ts");

// ---------------------------------------------------------------------------
// Batch state machine
// ---------------------------------------------------------------------------

test("isBatchTransitionAllowed — valid transitions", async (t) => {
  await t.test("drafted → policy_checked", () => {
    assert.ok(isBatchTransitionAllowed("drafted", "policy_checked"));
  });

  await t.test("policy_checked → pending_approval", () => {
    assert.ok(isBatchTransitionAllowed("policy_checked", "pending_approval"));
  });

  await t.test("policy_checked → approved", () => {
    assert.ok(isBatchTransitionAllowed("policy_checked", "approved"));
  });

  await t.test("policy_checked → blocked", () => {
    assert.ok(isBatchTransitionAllowed("policy_checked", "blocked"));
  });

  await t.test("pending_approval → approved", () => {
    assert.ok(isBatchTransitionAllowed("pending_approval", "approved"));
  });

  await t.test("pending_approval → blocked", () => {
    assert.ok(isBatchTransitionAllowed("pending_approval", "blocked"));
  });

  await t.test("approved → executing", () => {
    assert.ok(isBatchTransitionAllowed("approved", "executing"));
  });

  await t.test("approved → expired", () => {
    assert.ok(isBatchTransitionAllowed("approved", "expired"));
  });

  await t.test("executing → paused (kill-switch)", () => {
    assert.ok(isBatchTransitionAllowed("executing", "paused"));
  });

  await t.test("executing → completed", () => {
    assert.ok(isBatchTransitionAllowed("executing", "completed"));
  });

  await t.test("paused → executing (resume)", () => {
    assert.ok(isBatchTransitionAllowed("paused", "executing"));
  });

  await t.test("paused → expired (window passed)", () => {
    assert.ok(isBatchTransitionAllowed("paused", "expired"));
  });
});

test("isBatchTransitionAllowed — terminal states have no exits", async (t) => {
  for (const terminal of ["completed", "expired", "blocked"]) {
    await t.test(`${terminal} has no valid exits`, () => {
      assert.strictEqual(BATCH_TRANSITIONS[terminal].length, 0);
    });
  }
});

test("isBatchTransitionAllowed — invalid transitions blocked", async (t) => {
  await t.test("drafted cannot skip to approved", () => {
    assert.ok(!isBatchTransitionAllowed("drafted", "approved"));
  });

  await t.test("completed cannot go back to executing", () => {
    assert.ok(!isBatchTransitionAllowed("completed", "executing"));
  });

  await t.test("blocked cannot become approved", () => {
    assert.ok(!isBatchTransitionAllowed("blocked", "approved"));
  });

  await t.test("approved cannot go back to drafted", () => {
    assert.ok(!isBatchTransitionAllowed("approved", "drafted"));
  });
});

// ---------------------------------------------------------------------------
// Action state machine
// ---------------------------------------------------------------------------

test("isActionTransitionAllowed — valid transitions", async (t) => {
  await t.test("queued → sent", () => {
    assert.ok(isActionTransitionAllowed("queued", "sent"));
  });

  await t.test("queued → orphaned (no callback)", () => {
    assert.ok(isActionTransitionAllowed("queued", "orphaned"));
  });

  await t.test("sent → delivered", () => {
    assert.ok(isActionTransitionAllowed("sent", "delivered"));
  });

  await t.test("sent → bounced", () => {
    assert.ok(isActionTransitionAllowed("sent", "bounced"));
  });

  await t.test("sent → orphaned (callback never arrived)", () => {
    assert.ok(isActionTransitionAllowed("sent", "orphaned"));
  });

  await t.test("delivered → outcome_captured", () => {
    assert.ok(isActionTransitionAllowed("delivered", "outcome_captured"));
  });

  await t.test("delivered → closed (no outcome)", () => {
    assert.ok(isActionTransitionAllowed("delivered", "closed"));
  });

  await t.test("outcome_captured → closed", () => {
    assert.ok(isActionTransitionAllowed("outcome_captured", "closed"));
  });
});

test("isActionTransitionAllowed — terminal states have no exits", async (t) => {
  for (const terminal of ["closed", "orphaned"]) {
    await t.test(`${terminal} has no valid exits`, () => {
      assert.strictEqual(ACTION_TRANSITIONS[terminal].length, 0);
    });
  }
});

test("isActionTransitionAllowed — invalid transitions blocked", async (t) => {
  await t.test("closed cannot re-open to sent", () => {
    assert.ok(!isActionTransitionAllowed("closed", "sent"));
  });

  await t.test("orphaned cannot be re-sent (anti double-send)", () => {
    assert.ok(!isActionTransitionAllowed("orphaned", "queued"));
    assert.ok(!isActionTransitionAllowed("orphaned", "sent"));
  });

  await t.test("bounced cannot go to delivered", () => {
    assert.ok(!isActionTransitionAllowed("bounced", "delivered"));
  });
});

// ---------------------------------------------------------------------------
// Content hash input
// ---------------------------------------------------------------------------

test("buildContentHashInput — deterministic and pipe-separated", () => {
  const input = buildContentHashInput({
    messageTemplate: "Hello {{name}}",
    audienceType: "warm_lead",
    jurisdiction: "CA",
    consentBasis: "implied_verified",
    aiDisclosure: "Assisted by Orya HQ AI",
  });

  assert.ok(input.includes("|"), "should use pipe separator");
  assert.ok(input.startsWith("Hello {{name}}"));
  assert.ok(input.includes("warm_lead"));
  assert.ok(input.includes("CA"));
  assert.ok(input.includes("implied_verified"));
  assert.ok(input.includes("Assisted by Orya HQ AI"));
});

test("buildContentHashInput — different templates produce different inputs", () => {
  const a = buildContentHashInput({
    messageTemplate: "Template A",
    audienceType: "warm_lead",
    jurisdiction: "CA",
    consentBasis: "implied_verified",
    aiDisclosure: "Assisted",
  });
  const b = buildContentHashInput({
    messageTemplate: "Template B",
    audienceType: "warm_lead",
    jurisdiction: "CA",
    consentBasis: "implied_verified",
    aiDisclosure: "Assisted",
  });

  assert.notStrictEqual(a, b, "different templates must produce different inputs");
});

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

test("buildActionIdempotencyKey — format batchId:leadId", () => {
  const key = buildActionIdempotencyKey("batch_abc", "lead_123");
  assert.strictEqual(key, "batch_abc:lead_123");
});

test("buildActionIdempotencyKey — same inputs always produce same key", () => {
  const key1 = buildActionIdempotencyKey("batch_abc", "lead_123");
  const key2 = buildActionIdempotencyKey("batch_abc", "lead_123");
  assert.strictEqual(key1, key2, "idempotency key must be stable");
});

test("buildActionIdempotencyKey — different lead produces different key", () => {
  const key1 = buildActionIdempotencyKey("batch_abc", "lead_123");
  const key2 = buildActionIdempotencyKey("batch_abc", "lead_456");
  assert.notStrictEqual(key1, key2);
});
