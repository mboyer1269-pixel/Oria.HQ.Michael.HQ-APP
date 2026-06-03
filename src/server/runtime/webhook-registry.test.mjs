import assert from "node:assert/strict";
import path from "node:path";
import test, { describe, beforeEach, afterEach } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
  },
});

const { resolveApprovedWebhook } = await jiti.import(
  path.join(projectRoot, "src/server/runtime/webhook-registry.ts")
);

describe("Webhook Registry", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns null if agentId and skillId have no binding", () => {
    const result = resolveApprovedWebhook("unknown-agent", "unknown-skill");
    assert.equal(result, null);
  });

  test("returns null if the environment variable is missing", () => {
    delete process.env.AGENT_HERMES_WEBHOOK_URL;
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns null if the URL is invalid", () => {
    process.env.AGENT_HERMES_WEBHOOK_URL = "not-a-valid-url";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns null if the hostname is not in the allowlist", () => {
    process.env.AGENT_HERMES_WEBHOOK_URL = "https://evil-hacker.com/webhook";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns the resolved webhook if the URL is valid and allowed", () => {
    process.env.AGENT_HERMES_WEBHOOK_URL = "https://hooks.n8n.cloud/webhook/1234";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.ok(result);
    assert.equal(result.url, "https://hooks.n8n.cloud/webhook/1234");
    assert.equal(result.binding.agentId, "hermes");
    assert.equal(result.binding.skillId, "task.create");
    assert.equal(result.binding.requiresSignature, true);
  });
});
