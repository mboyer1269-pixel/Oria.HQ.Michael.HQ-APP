import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("orchestrator id config keeps default behaviour ('joris')", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src") } });
  const orch = await jiti.import(path.join(__dirname, "orchestrator.ts"));
  const cfg = await jiti.import(path.join(projectRoot, "src/config/workspaces/michael-hq.config.ts"));
  const council = await jiti.import(path.join(projectRoot, "src/server/agents/agent-council-run-contract.ts"));
  const license = await jiti.import(path.join(projectRoot, "src/server/agents/agent-execution-license.ts"));
  const display = await jiti.import(path.join(projectRoot, "src/features/agents/orchestrator-display.ts"));

  assert.equal(orch.ORCHESTRATOR_AGENT_ID, cfg.MICHAEL_HQ_WORKSPACE_CONFIG.defaultAssistantId);
  assert.equal(orch.getOrchestratorAgentId(), "joris");
  assert.equal(council.AGENT_COUNCIL_ORCHESTRATOR_ID, "joris");
  assert.ok(license.agentLicenseRegistry.some((l) => l.agentId === "joris"));
  assert.equal(display.ORCHESTRATOR_DISPLAY_NAME, "Joris");
});

test("cockpit topbar copy interpolates the orchestrator display name (no hard-coded name)", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, { alias: { "@": path.join(projectRoot, "src") } });
  const copy = await jiti.import(path.join(projectRoot, "src/features/hq/i18n/ui-copy.ts"));
  assert.equal(copy.getUICopy("fr").jorisBadge, "Joris · assistant");
  assert.equal(copy.getUICopy("fr", "Ava").jorisBadge, "Ava · assistant");
  assert.match(copy.getUICopy("en", "Ava").jorisTooltip, /^Ava powers/);
});
