// src/server/runtime/webhook-registry.test.mjs
//
// The registry is the webhook half of the single execution-corridor contract.
// These tests pin the two things that make it auditable: a binding names the
// destination variable the DISPATCHER actually reads, and an unusable
// destination is reported as a named state rather than a silent null.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const {
  findApprovedWebhookBinding,
  listApprovedWebhookBindings,
  resolveApprovedWebhook,
  resolveWebhookConfigurationState,
} = await jiti.import(path.join(projectRoot, "src/server/runtime/webhook-registry.ts"));

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
    delete process.env.N8N_WEBHOOK_URL;
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns null if the URL is invalid", () => {
    process.env.N8N_WEBHOOK_URL = "not-a-valid-url";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns null if the hostname is not in the allowlist", () => {
    process.env.N8N_WEBHOOK_URL = "https://evil-hacker.com/webhook";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.equal(result, null);
  });

  test("returns the resolved webhook if the URL is valid and allowed", () => {
    process.env.N8N_WEBHOOK_URL = "https://hooks.n8n.cloud/webhook/1234";
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.ok(result);
    assert.equal(result.url, "https://hooks.n8n.cloud/webhook/1234");
    assert.equal(result.binding.agentId, "hermes");
    assert.equal(result.binding.skillId, "task.create");
    assert.equal(result.binding.requiresSignature, true);
  });
});

describe("Webhook Registry — the binding names the destination the dispatcher reads", () => {
  test("every binding declares the same env key the n8n tool resolves", async () => {
    // The bindings used to carry a per-agent key (AGENT_HERMES_WEBHOOK_URL)
    // that no code path ever read: the dispatcher resolves N8N_WEBHOOK_URL.
    // A registry naming a different variable than the code cannot be audited —
    // an operator setting the documented variable would change nothing.
    const tool = await readFile(
      path.join(projectRoot, "src/server/agents/tools/n8n-webhook-trigger.ts"),
      "utf8",
    );

    const bindings = listApprovedWebhookBindings();
    assert.ok(bindings.length > 0, "the registry must declare at least one binding");

    for (const binding of bindings) {
      assert.ok(
        tool.includes(`process.env.${binding.destinationEnvKey}`),
        `${binding.agentId}/${binding.skillId} declares ${binding.destinationEnvKey}, ` +
          "which the dispatcher never reads. Registry and dispatcher must name one variable.",
      );
    }
  });

  test("every binding names the tool that actually dispatches it", async () => {
    const registry = await readFile(
      path.join(projectRoot, "src/server/agents/tools/registry.ts"),
      "utf8",
    );
    const toolSource = await readFile(
      path.join(projectRoot, "src/server/agents/tools/n8n-webhook-trigger.ts"),
      "utf8",
    );

    for (const binding of listApprovedWebhookBindings()) {
      assert.ok(
        toolSource.includes(`"${binding.toolName}"`),
        `${binding.toolName} is not the name the n8n tool declares`,
      );
      assert.match(
        registry,
        /mcpToolRegistry\.register\(/,
        "the tool must be registered for the approve route to find it",
      );
    }
  });

  test("actionId is carried explicitly, never assumed equal to skillId", () => {
    // The licence zones ACTIONS; the catalog declares SKILLS. They coincide for
    // every binding today, and this asserts the field exists so a future
    // divergence is representable instead of silently collapsing.
    for (const binding of listApprovedWebhookBindings()) {
      assert.equal(typeof binding.actionId, "string");
      assert.ok(binding.actionId.length > 0, `${binding.agentId} has an empty actionId`);
    }
  });
});

describe("Webhook Registry — configuration state is named, not null", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  const binding = () => findApprovedWebhookBinding("hermes", "task.create");

  test("missing env is distinguishable from a bad hostname", () => {
    assert.equal(
      resolveWebhookConfigurationState(binding(), {}),
      "destination_env_missing",
    );
    assert.equal(
      resolveWebhookConfigurationState(binding(), { N8N_WEBHOOK_URL: "https://evil.example/x" }),
      "destination_hostname_not_allowed",
    );
    assert.equal(
      resolveWebhookConfigurationState(binding(), { N8N_WEBHOOK_URL: "nope" }),
      "destination_url_invalid",
    );
  });

  test("localhost is configured locally and refused in production", () => {
    assert.equal(
      resolveWebhookConfigurationState(binding(), { N8N_WEBHOOK_URL: "http://localhost:5678/x" }),
      "configured",
    );
    assert.equal(
      resolveWebhookConfigurationState(binding(), {
        N8N_WEBHOOK_URL: "http://localhost:5678/x",
        NODE_ENV: "production",
      }),
      "destination_localhost_in_production",
    );
  });
});
