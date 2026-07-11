#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../../..");

test("marketplace provider contract is fail-closed", async () => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "marketplace-provider-contract.ts"));
  const contract = mod.createMarketplaceProviderContract({
    providerId: "adapter:marketplace-test",
    adapterKind: "marketplace_provider",
    displayName: "Test marketplace",
    skillBindings: [
      {
        skillId: "marketplace.browse",
        operation: "catalog.browse",
        requiredExecutionZone: "green",
        requiredAutonomyLevel: 1,
        requiresWager: false,
        supportsDryRun: true,
        supportsIdempotencyKey: true,
      },
    ],
    allowedOperations: ["catalog.browse"],
    forbiddenOperations: ["ads.spend"],
    rateLimit: { maxCallsPerMinute: 10 },
    secretRefs: [],
    failureMode: "fail_closed",
    handoffMode: "ceo_review",
    provenance: {
      registeredAt: "2026-07-11T00:00:00.000Z",
      registeredBy: "ceo",
      manifestTrust: "untrusted",
    },
  });

  assert.equal(contract.catalog.browseIsReadOnly, true);
  assert.equal(contract.catalog.enableRequiresApproval, true);
  assert.equal(contract.execution.viaSkillIdOnly, true);
  assert.equal(contract.execution.autoExecuteRequiresActiveLine, true);
  assert.equal(contract.execution.spendRequiresCeoConfirmation, true);
  assert.equal(contract.marketing.studioPreparesOnly, true);
  assert.equal(contract.marketing.publishRequiresManualSend, true);
  assert.ok(mod.MARKETPLACE_PROVIDER_INVARIANTS.includes("spendRequiresCeoConfirmation"));
});
