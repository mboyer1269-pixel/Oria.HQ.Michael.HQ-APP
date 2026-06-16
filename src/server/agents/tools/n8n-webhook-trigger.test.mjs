#!/usr/bin/env node

// src/server/agents/tools/n8n-webhook-trigger.test.mjs
//
// fetch is ALWAYS injected -- this test never makes a real network call.

import assert from "node:assert/strict";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const { n8nWebhookTriggerTool } = await jiti.import(
  path.join(__dirname, "n8n-webhook-trigger.ts"),
);

const ORIGINAL_ENV = process.env;

const PAYLOAD = {
  agentId: "hermes",
  skillId: "task.create",
  client: "Acme",
  email: "buyer@acme.com",
  actionType: "send_email",
  missionId: "m-1",
  data: { foo: "bar" },
};

function makeFetch(response) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (typeof response === "function") return response(url, init);
    return response;
  };
  fn.calls = calls;
  return fn;
}

const okResponse = { ok: true, status: 200, json: async () => ({ received: true }) };

function ctx(deps) {
  return { workspaceId: "ws1", agentId: "hermes", deps };
}

describe("n8n_webhook_trigger tool", () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      AGENT_WEBHOOK_SIGNING_SECRET: "sign-key",
      N8N_SECRET: "static-secret",
      N8N_WEBHOOK_URL: "https://hooks.n8n.cloud/webhook/abc",
    };
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test("happy path: HMAC + static-secret headers, posts to N8N_WEBHOOK_URL", async () => {
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true, now: () => 1000 }),
    );

    assert.equal(res.ok, true);
    assert.ok(res.actionRef);
    assert.equal(fetchImpl.calls.length, 1);

    const { url, init } = fetchImpl.calls[0];
    assert.equal(url, "https://hooks.n8n.cloud/webhook/abc");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-webhook-secret"], "static-secret");
    assert.match(init.headers["x-orya-signature"], /^[0-9a-f]{64}$/);
    assert.equal(init.headers["x-orya-timestamp"], "1000");

    const body = JSON.parse(init.body);
    assert.equal(body.client, "Acme");
    assert.equal(body.email, "buyer@acme.com");
    assert.equal(body.actionType, "send_email");
  });

  test("missing N8N_WEBHOOK_URL is refused (no fetch)", async () => {
    delete process.env.N8N_WEBHOOK_URL;
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /N8N_WEBHOOK_URL/);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test("missing N8N_SECRET is refused (no fetch)", async () => {
    delete process.env.N8N_SECRET;
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /N8N_SECRET/);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test("hostname not in the binding allowlist is refused", async () => {
    process.env.N8N_WEBHOOK_URL = "https://evil-hacker.com/webhook";
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /hostname/);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test("agent/skill with no approved binding is refused", async () => {
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      { ...PAYLOAD, agentId: "ghost", skillId: "unknown.skill" },
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /No approved webhook binding/);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test("rate limit blocks the dispatch and stays retryable", async () => {
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => false }),
    );
    assert.equal(res.ok, false);
    assert.equal(res.rateLimited, true);
    assert.equal(fetchImpl.calls.length, 0);
  });

  test("non-2xx response surfaces a failure", async () => {
    const fetchImpl = makeFetch({ ok: false, status: 500, statusText: "err", json: async () => ({}) });
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /500/);
  });

  test("a thrown fetch (timeout/abort) is caught as a failure", async () => {
    const fetchImpl = async () => {
      throw new Error("aborted");
    };
    const res = await n8nWebhookTriggerTool.handler(
      PAYLOAD,
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /aborted/);
  });

  test("an invalid payload is rejected before any network work", async () => {
    const fetchImpl = makeFetch(okResponse);
    const res = await n8nWebhookTriggerTool.handler(
      { ...PAYLOAD, email: "not-an-email" },
      ctx({ fetchImpl, isAllowed: async () => true }),
    );
    assert.equal(res.ok, false);
    assert.match(res.error, /Invalid/);
    assert.equal(fetchImpl.calls.length, 0);
  });
});
