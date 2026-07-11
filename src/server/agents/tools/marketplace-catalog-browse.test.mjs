#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
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

const { marketplaceCatalogBrowseTool } = await jiti.import(
  path.join(__dirname, "marketplace-catalog-browse.ts"),
);
const { mcpToolRegistry } = await jiti.import(path.join(__dirname, "registry.ts"));

test("marketplace_catalog_browse MCP tool", async (t) => {
  await t.test("is registered on the MCP registry", () => {
    assert.equal(mcpToolRegistry.has("marketplace_catalog_browse"), true);
    assert.equal(mcpToolRegistry.has("n8n_webhook_trigger"), true);
  });

  await t.test("handler returns browse snapshot without network", async () => {
    const res = await marketplaceCatalogBrowseTool.handler(
      { query: "email", readOnlyOnly: true },
      { workspaceId: "ws1", agentId: "marketing" },
    );
    assert.equal(res.ok, true);
    assert.equal(res.output.browseIsReadOnly, true);
    assert.equal(res.output.liveOAuthAttached, false);
    assert.ok(res.output.entryCount >= 1);
  });

  await t.test("rejects invalid payload", async () => {
    const res = await marketplaceCatalogBrowseTool.handler(
      { query: 123 },
      { workspaceId: "ws1" },
    );
    assert.equal(res.ok, false);
  });
});
