#!/usr/bin/env node

// src/server/agents/tools/registry.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test, { describe } from "node:test";
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

const { mcpToolRegistry, McpToolRegistry } = await jiti.import(path.join(__dirname, "registry.ts"));
const { N8N_WEBHOOK_TRIGGER_TOOL_NAME, n8nWebhookTriggerTool } = await jiti.import(
  path.join(__dirname, "n8n-webhook-trigger.ts"),
);

describe("MCP tool registry", () => {
  test("the singleton is pre-seeded with n8n_webhook_trigger", () => {
    const tool = mcpToolRegistry.get(N8N_WEBHOOK_TRIGGER_TOOL_NAME);
    assert.ok(tool, "n8n_webhook_trigger must be registered");
    assert.equal(tool.name, N8N_WEBHOOK_TRIGGER_TOOL_NAME);
    assert.equal(mcpToolRegistry.has(N8N_WEBHOOK_TRIGGER_TOOL_NAME), true);
    assert.ok(mcpToolRegistry.list().some((t) => t.name === N8N_WEBHOOK_TRIGGER_TOOL_NAME));
  });

  test("get returns null for an unknown tool", () => {
    assert.equal(mcpToolRegistry.get("does.not.exist"), null);
  });

  test("listDefinitions projects to MCP JSON-Schema shape", () => {
    const defs = mcpToolRegistry.listDefinitions();
    const def = defs.find((d) => d.name === N8N_WEBHOOK_TRIGGER_TOOL_NAME);
    assert.ok(def, "definition present");
    assert.equal(typeof def.description, "string");
    assert.ok(def.inputSchema && typeof def.inputSchema === "object");
    // JSON Schema for an object payload.
    assert.equal(def.inputSchema.type, "object");
    assert.ok(def.inputSchema.properties, "payload properties advertised");
    assert.ok(def.inputSchema.properties.email, "email is advertised");
  });

  test("a fresh registry registers and rejects duplicate names", () => {
    const reg = new McpToolRegistry();
    assert.equal(reg.has(N8N_WEBHOOK_TRIGGER_TOOL_NAME), false);
    reg.register(n8nWebhookTriggerTool);
    assert.equal(reg.get(N8N_WEBHOOK_TRIGGER_TOOL_NAME)?.name, N8N_WEBHOOK_TRIGGER_TOOL_NAME);
    assert.throws(() => reg.register(n8nWebhookTriggerTool), /already registered/i);
  });
});
