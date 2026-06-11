#!/usr/bin/env node

// src/server/outbound/outbound-channel.test.mjs
//
// Pure unit tests for the outbound channel abstraction.
// No DB, no network, no side effects.

import assert from "node:assert/strict";
import test from "node:test";

const {
  EMAIL_CHANNEL,
  SMS_CHANNEL,
  getChannelDescriptor,
  listChannelDescriptors,
  validateActionForChannel,
} = await import("./outbound-channel.ts");

function makeBatch(overrides = {}) {
  return {
    consentBasis: "implied_verified",
    audienceType: "warm_lead",
    unsubscribeMechanism: "present",
    ...overrides,
  };
}

function makeAction(overrides = {}) {
  return {
    renderedBody: "Bonjour, voici votre audit Loi 96.",
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return {
    sentTodayOnChannel: 0,
    recipientLocalHour: 14,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

test("registry exposes exactly email and sms", () => {
  const ids = listChannelDescriptors().map((c) => c.channelId).sort();
  assert.deepEqual(ids, ["email", "sms"]);
});

test("getChannelDescriptor returns the email descriptor", () => {
  assert.equal(getChannelDescriptor("email"), EMAIL_CHANNEL);
});

test("getChannelDescriptor throws on unknown channel", () => {
  assert.throws(() => getChannelDescriptor("pigeon"), /Unknown outbound channel/);
});

test("descriptor caps are hard constants per doctrine", () => {
  assert.equal(EMAIL_CHANNEL.dailyCap, 20);
  assert.equal(SMS_CHANNEL.dailyCap, 10);
  assert.equal(SMS_CHANNEL.maxBodyLength, 1600);
  assert.deepEqual(SMS_CHANNEL.quietHours, { startHour: 21, endHour: 9 });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

test("email: valid warm-lead action passes", () => {
  const result = validateActionForChannel(EMAIL_CHANNEL, makeBatch(), makeAction(), makeContext());
  assert.deepEqual(result, { ok: true });
});

test("sms: valid warm-lead daytime action passes", () => {
  const result = validateActionForChannel(SMS_CHANNEL, makeBatch(), makeAction(), makeContext());
  assert.deepEqual(result, { ok: true });
});

test("email: cold_prospect is allowed (Yellow corridor, CEO click)", () => {
  const result = validateActionForChannel(
    EMAIL_CHANNEL,
    makeBatch({ audienceType: "cold_prospect" }),
    makeAction(),
    makeContext(),
  );
  assert.deepEqual(result, { ok: true });
});

// ---------------------------------------------------------------------------
// Structural blocks
// ---------------------------------------------------------------------------

test("sms: cold_prospect is structurally blocked", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch({ audienceType: "cold_prospect" }),
    makeAction(),
    makeContext(),
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === "audience_blocked_on_channel"));
});

test("unknown consent basis is blocked on every channel (fail-safe)", () => {
  for (const channel of listChannelDescriptors()) {
    const result = validateActionForChannel(
      channel,
      makeBatch({ consentBasis: "unknown" }),
      makeAction(),
      makeContext(),
    );
    assert.equal(result.ok, false, `channel ${channel.channelId} must block unknown consent`);
    assert.ok(result.violations.some((v) => v.code === "consent_basis_not_allowed"));
  }
});

test("manual_review_required consent is blocked on every channel", () => {
  for (const channel of listChannelDescriptors()) {
    const result = validateActionForChannel(
      channel,
      makeBatch({ consentBasis: "manual_review_required" }),
      makeAction(),
      makeContext(),
    );
    assert.equal(result.ok, false);
  }
});

// ---------------------------------------------------------------------------
// Caps
// ---------------------------------------------------------------------------

test("daily cap blocks at exactly the cap", () => {
  const result = validateActionForChannel(
    EMAIL_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ sentTodayOnChannel: 20 }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === "daily_cap_reached"));
});

test("daily cap allows one-below-cap", () => {
  const result = validateActionForChannel(
    EMAIL_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ sentTodayOnChannel: 19 }),
  );
  assert.deepEqual(result, { ok: true });
});

// ---------------------------------------------------------------------------
// Quiet hours (sms only)
// ---------------------------------------------------------------------------

test("sms: blocked at 22h local (quiet hours)", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ recipientLocalHour: 22 }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === "quiet_hours"));
});

test("sms: blocked at 8h local (quiet hours end at 9h)", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ recipientLocalHour: 8 }),
  );
  assert.equal(result.ok, false);
});

test("sms: allowed at 9h local exactly", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ recipientLocalHour: 9 }),
  );
  assert.deepEqual(result, { ok: true });
});

test("sms: unknown recipient local time blocks (fail-safe)", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ recipientLocalHour: null }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === "recipient_local_time_unknown"));
});

test("email: unknown recipient local time is fine (no quiet hours)", () => {
  const result = validateActionForChannel(
    EMAIL_CHANNEL,
    makeBatch(),
    makeAction(),
    makeContext({ recipientLocalHour: null }),
  );
  assert.deepEqual(result, { ok: true });
});

// ---------------------------------------------------------------------------
// Body + opt-out
// ---------------------------------------------------------------------------

test("empty body is blocked everywhere", () => {
  for (const channel of listChannelDescriptors()) {
    const result = validateActionForChannel(
      channel,
      makeBatch(),
      makeAction({ renderedBody: "   " }),
      makeContext(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => v.code === "body_empty"));
  }
});

test("sms: body over 1600 chars is blocked", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch(),
    makeAction({ renderedBody: "x".repeat(1601) }),
    makeContext(),
  );
  assert.equal(result.ok, false);
  assert.ok(result.violations.some((v) => v.code === "body_too_long"));
});

test("email: long body is fine (no max length)", () => {
  const result = validateActionForChannel(
    EMAIL_CHANNEL,
    makeBatch(),
    makeAction({ renderedBody: "x".repeat(20000) }),
    makeContext(),
  );
  assert.deepEqual(result, { ok: true });
});

test("missing unsubscribe mechanism blocks on both channels", () => {
  for (const channel of listChannelDescriptors()) {
    const result = validateActionForChannel(
      channel,
      makeBatch({ unsubscribeMechanism: "absent" }),
      makeAction(),
      makeContext(),
    );
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((v) => v.code === "unsubscribe_mechanism_missing"));
  }
});

test("multiple violations are all reported", () => {
  const result = validateActionForChannel(
    SMS_CHANNEL,
    makeBatch({ audienceType: "cold_prospect", consentBasis: "unknown", unsubscribeMechanism: "absent" }),
    makeAction({ renderedBody: "" }),
    makeContext({ sentTodayOnChannel: 10, recipientLocalHour: 23 }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 6);
});
