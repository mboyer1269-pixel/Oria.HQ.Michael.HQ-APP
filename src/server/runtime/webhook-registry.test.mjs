// src/server/runtime/webhook-registry.test.mjs
//
// The registry is the webhook half of the execution-corridor contract. These
// tests assert what makes it auditable: registry and dispatcher resolve one
// destination variable, readiness covers every value the dispatcher requires,
// and the deployment-mode guard cannot be removed by an injected environment.
//
// Assertions compare exported values rather than scanning source text, so a
// refactor of the dispatcher does not silently satisfy them.

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
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const registry = await jiti.import("@/server/runtime/webhook-registry");
const {
  findApprovedWebhookBinding,
  listApprovedWebhookBindings,
  resolveApprovedWebhook,
  resolveWebhookConfigurationState,
  N8N_DESTINATION_ENV_KEY,
  N8N_STATIC_SECRET_ENV_KEY,
  AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY,
} = registry;

const tools = await jiti.import("@/server/agents/tools/registry");
const n8nTool = await jiti.import("@/server/agents/tools/n8n-webhook-trigger");

/** Full dispatch configuration for a signed binding. */
const CONFIGURED = {
  [N8N_DESTINATION_ENV_KEY]: "https://hooks.n8n.cloud/webhook/1234",
  [N8N_STATIC_SECRET_ENV_KEY]: "static",
  [AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY]: "signing",
};

describe("Webhook Registry — destination resolution", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, ...CONFIGURED };
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  test("returns null if agentId and skillId have no binding", () => {
    assert.equal(resolveApprovedWebhook("unknown-agent", "unknown-skill"), null);
  });

  test("returns null if the destination variable is missing", () => {
    delete process.env[N8N_DESTINATION_ENV_KEY];
    assert.equal(resolveApprovedWebhook("hermes", "task.create"), null);
  });

  test("returns null if the URL is invalid", () => {
    process.env[N8N_DESTINATION_ENV_KEY] = "not-a-valid-url";
    assert.equal(resolveApprovedWebhook("hermes", "task.create"), null);
  });

  test("returns null if the hostname is not in the allowlist", () => {
    process.env[N8N_DESTINATION_ENV_KEY] = "https://evil-hacker.com/webhook";
    assert.equal(resolveApprovedWebhook("hermes", "task.create"), null);
  });

  test("returns null if a required secret is missing", () => {
    delete process.env[N8N_STATIC_SECRET_ENV_KEY];
    assert.equal(
      resolveApprovedWebhook("hermes", "task.create"),
      null,
      "a destination without the transfer secret cannot dispatch",
    );
  });

  test("returns the resolved webhook when the configuration is complete", () => {
    const result = resolveApprovedWebhook("hermes", "task.create");
    assert.ok(result);
    assert.equal(result.url, CONFIGURED[N8N_DESTINATION_ENV_KEY]);
    assert.equal(result.binding.agentId, "hermes");
    assert.equal(result.binding.skillId, "task.create");
    assert.equal(result.binding.requiresSignature, true);
  });
});

describe("Webhook Registry — one destination, named by both sides", () => {
  test("every binding declares the constant the dispatcher imports", () => {
    // Value comparison, not source scanning: the dispatcher can read the
    // variable however it likes as long as both sides name the same constant.
    assert.equal(typeof N8N_DESTINATION_ENV_KEY, "string");
    assert.ok(N8N_DESTINATION_ENV_KEY.length > 0);

    const bindings = listApprovedWebhookBindings();
    assert.ok(bindings.length > 0, "the registry must declare at least one binding");
    for (const binding of bindings) {
      assert.equal(
        binding.destinationEnvKey,
        N8N_DESTINATION_ENV_KEY,
        `${binding.agentId}/${binding.skillId} names a destination the dispatcher does not read`,
      );
    }
  });

  test("every binding names a tool that is actually registered", () => {
    // Membership in the registry, not the presence of a registration call: the
    // approve route resolves the binding's toolName and cannot dispatch without it.
    for (const binding of listApprovedWebhookBindings()) {
      assert.equal(
        tools.mcpToolRegistry.has(binding.toolName),
        true,
        `${binding.toolName} is not registered — the approve route could not dispatch this binding`,
      );
    }
    assert.equal(n8nTool.N8N_WEBHOOK_TRIGGER_TOOL_NAME, "n8n_webhook_trigger");
    assert.ok(
      listApprovedWebhookBindings().every(
        (b) => b.toolName === n8nTool.N8N_WEBHOOK_TRIGGER_TOOL_NAME,
      ),
    );
  });

  test("actionId is carried explicitly, never assumed equal to skillId", () => {
    for (const binding of listApprovedWebhookBindings()) {
      assert.equal(typeof binding.actionId, "string");
      assert.ok(binding.actionId.length > 0, `${binding.agentId} has an empty actionId`);
    }
  });
});

describe("Webhook Registry — readiness is every value the dispatcher requires", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  const binding = () => findApprovedWebhookBinding("hermes", "task.create");

  test("each missing value produces its own named state", () => {
    assert.equal(resolveWebhookConfigurationState(binding(), {}), "destination_env_missing");
    assert.equal(
      resolveWebhookConfigurationState(binding(), { [N8N_DESTINATION_ENV_KEY]: "nope" }),
      "destination_url_invalid",
    );
    assert.equal(
      resolveWebhookConfigurationState(binding(), {
        [N8N_DESTINATION_ENV_KEY]: "https://evil.example/x",
      }),
      "destination_hostname_not_allowed",
    );

    const noStatic = { ...CONFIGURED };
    delete noStatic[N8N_STATIC_SECRET_ENV_KEY];
    assert.equal(resolveWebhookConfigurationState(binding(), noStatic), "static_secret_missing");

    const noSigning = { ...CONFIGURED };
    delete noSigning[AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY];
    assert.equal(resolveWebhookConfigurationState(binding(), noSigning), "signing_secret_missing");

    assert.equal(resolveWebhookConfigurationState(binding(), CONFIGURED), "configured");
  });

  test("an unsigned binding does not require the signing secret", () => {
    const unsigned = { ...binding(), requiresSignature: false };
    const noSigning = { ...CONFIGURED };
    delete noSigning[AGENT_WEBHOOK_SIGNING_SECRET_ENV_KEY];
    assert.equal(resolveWebhookConfigurationState(unsigned, noSigning), "configured");
  });

  test("the production guard reads the process, not the injected object", () => {
    // The injected env supplies configuration values under test. Reading the
    // deployment mode from it too would let a caller passing a partial object
    // remove the localhost guard while the process runs in production.
    const localhost = { ...CONFIGURED, [N8N_DESTINATION_ENV_KEY]: "http://localhost:5678/x" };

    process.env.NODE_ENV = "test";
    assert.equal(resolveWebhookConfigurationState(binding(), localhost), "configured");

    process.env.NODE_ENV = "production";
    assert.equal(
      resolveWebhookConfigurationState(binding(), localhost),
      "destination_localhost_in_production",
      "a partial injected env removed the production localhost guard",
    );
    // Even when the injected object claims a non-production mode.
    assert.equal(
      resolveWebhookConfigurationState(binding(), { ...localhost, NODE_ENV: "development" }),
      "destination_localhost_in_production",
    );
  });
});
