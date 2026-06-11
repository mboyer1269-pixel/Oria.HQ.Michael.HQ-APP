#!/usr/bin/env node

// src/server/outbound/resend-email-adapter.test.mjs
//
// Pure unit tests for the Resend adapter. Fake client — no network.

import assert from "node:assert/strict";
import test from "node:test";

const { createResendEmailAdapter } = await import("./resend-email-adapter.ts");

const CONFIG = { fromEmail: "audit@conformite.example.com", fromName: "Orya HQ", replyTo: "michael@example.com" };

function makeInput(overrides = {}) {
  return {
    to: "sales@leetwo.com",
    subject: "7 non-conformités Loi 96",
    body: "Bonjour…",
    idempotencyKey: "batch_1:lead_leetwo",
    ...overrides,
  };
}

test("sends one email with from, replyTo and idempotency header", async () => {
  const sent = [];
  const adapter = createResendEmailAdapter(CONFIG, async () => ({
    emails: {
      async send(payload) {
        sent.push(payload);
        return { data: { id: "msg_42" }, error: null };
      },
    },
  }));

  const outcome = await adapter.send(makeInput());
  assert.deepEqual(outcome, { ok: true, providerMessageId: "msg_42" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, "Orya HQ <audit@conformite.example.com>");
  assert.deepEqual(sent[0].to, ["sales@leetwo.com"]);
  assert.equal(sent[0].replyTo, "michael@example.com");
  assert.equal(sent[0].headers["X-Orya-Idempotency-Key"], "batch_1:lead_leetwo");
});

test("provider error returns non-ok retryable outcome", async () => {
  const adapter = createResendEmailAdapter(CONFIG, async () => ({
    emails: {
      async send() {
        return { data: null, error: { message: "boom", name: "rate_limit_exceeded" } };
      },
    },
  }));
  const outcome = await adapter.send(makeInput());
  assert.deepEqual(outcome, { ok: false, errorCode: "rate_limit_exceeded", retryable: true });
});

test("provider exception returns non-ok retryable outcome (never throws)", async () => {
  const adapter = createResendEmailAdapter(CONFIG, async () => ({
    emails: {
      async send() {
        throw new Error("network down");
      },
    },
  }));
  const outcome = await adapter.send(makeInput());
  assert.deepEqual(outcome, { ok: false, errorCode: "provider_exception", retryable: true });
});

test("unavailable client factory returns non-retryable outcome", async () => {
  const adapter = createResendEmailAdapter(CONFIG, async () => {
    throw new Error("module missing");
  });
  const outcome = await adapter.send(makeInput());
  assert.deepEqual(outcome, { ok: false, errorCode: "provider_client_unavailable", retryable: false });
});

test("from is bare email when fromName omitted", async () => {
  const sent = [];
  const adapter = createResendEmailAdapter({ fromEmail: "a@b.c" }, async () => ({
    emails: {
      async send(payload) {
        sent.push(payload);
        return { data: { id: "m" }, error: null };
      },
    },
  }));
  await adapter.send(makeInput());
  assert.equal(sent[0].from, "a@b.c");
  assert.equal("replyTo" in sent[0], false);
});
