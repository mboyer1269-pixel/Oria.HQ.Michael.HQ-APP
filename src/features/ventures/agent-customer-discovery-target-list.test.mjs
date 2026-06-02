#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("AgentVentureCustomerDiscoveryTargetList", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const dataMod = await jiti.import(path.join(__dirname, "agent-venture-workbench-data.ts"));
  const discoveryMod = await jiti.import(path.join(__dirname, "agent-customer-discovery-target-list.ts"));
  const { AGENT_VENTURE_WORKBENCH_SEED } = dataMod;
  const { buildAgentVentureDiscoveryTargetList } = discoveryMod;

  function makeItem(overrides = {}) {
    return {
      ...clone(AGENT_VENTURE_WORKBENCH_SEED),
      ...overrides,
      brief: {
        ...clone(AGENT_VENTURE_WORKBENCH_SEED.brief),
        ...overrides.brief,
        risk: {
          ...clone(AGENT_VENTURE_WORKBENCH_SEED.brief.risk),
          ...(overrides.brief?.risk ?? {}),
        },
        validationPlan: {
          ...clone(AGENT_VENTURE_WORKBENCH_SEED.brief.validationPlan),
          ...(overrides.brief?.validationPlan ?? {}),
        },
        killCriteria: overrides.brief?.killCriteria ?? clone(AGENT_VENTURE_WORKBENCH_SEED.brief.killCriteria),
        evidence: overrides.brief?.evidence ?? clone(AGENT_VENTURE_WORKBENCH_SEED.brief.evidence),
        nextAction: {
          ...clone(AGENT_VENTURE_WORKBENCH_SEED.brief.nextAction),
          ...(overrides.brief?.nextAction ?? {}),
        },
      },
      workstream: {
        ...clone(AGENT_VENTURE_WORKBENCH_SEED.workstream),
        ...overrides.workstream,
      },
      briefScore: {
        ...clone(AGENT_VENTURE_WORKBENCH_SEED.briefScore),
        ...overrides.briefScore,
      },
      workstreamReadiness: {
        ...clone(AGENT_VENTURE_WORKBENCH_SEED.workstreamReadiness),
        ...overrides.workstreamReadiness,
      },
      profitabilityScore: {
        ...clone(AGENT_VENTURE_WORKBENCH_SEED.profitabilityScore),
        ...overrides.profitabilityScore,
      },
    };
  }

  await t.test("returns prioritized discovery targets with read-only safety flags", () => {
    const lowPriority = makeItem({
      id: "wb-discovery-002",
      brief: {
        title: "Low priority",
        targetCustomer: "Local teams",
        problem: "Need a better internal workflow",
        validationPlan: {
          validationChannel: "internal review only",
          firstValidationStep: "Document the workflow",
        },
      },
      profitabilityScore: {
        profitabilityScore: 32,
        recommendation: "reject_for_now",
        blockerCount: 4,
        nextCeoDecision: "Do not push discovery yet",
      },
    });

    const highPriority = makeItem({
      id: "wb-discovery-001",
      brief: {
        title: "High priority",
        targetCustomer: "SaaS founders",
        problem: "Need faster onboarding validation",
        validationPlan: {
          validationChannel: "founder communities",
          firstValidationStep: "Run 5 discovery calls",
        },
      },
      profitabilityScore: {
        profitabilityScore: 84,
        recommendation: "prioritize_for_validation",
        blockerCount: 1,
        nextCeoDecision: "Use this as a discovery lead",
      },
    });

    const list = buildAgentVentureDiscoveryTargetList([lowPriority, highPriority]);
    assert.equal(list.length, 2);
    assert.equal(list[0].workbenchItemId, "wb-discovery-001");
    assert.equal(list[0].readOnly, true);
    assert.equal(list[0].humanOnTheLoop, true);
    assert.equal(list[0].approvalRequired, true);
    assert.equal(list[0].noExecutionAuthorized, true);
    assert.equal(list[0].qualificationCriteria.length, 3);
    assert.equal(list[0].discoveryQuestions.length, 3);
    assert.equal(list[0].buyingSignals.length, 3);
    assert.equal(list[0].discoveryChannel, "founder communities");
    assert.match(list[0].persona, /Founder/i);
    assert.match(list[0].icp, /SaaS founders/);
    assert.match(list[0].priorityReason, /profitability/i);
  });

  await t.test("builder is deterministic and does not mutate the input", () => {
    const item = makeItem();
    const before = clone(item);
    const first = buildAgentVentureDiscoveryTargetList([item]);
    const second = buildAgentVentureDiscoveryTargetList([item]);

    assert.deepEqual(first, second);
    assert.deepEqual(item, before);
  });

  await t.test("qualification signals stay anchored to the workbench item", () => {
    const item = makeItem({
      brief: {
        targetCustomer: "Finance leads",
        problem: "Need to close books faster",
        validationPlan: {
          validationChannel: "direct interviews",
          firstValidationStep: "Schedule 5 interviews",
        },
      },
    });

    const [target] = buildAgentVentureDiscoveryTargetList([item]);
    assert.match(target.qualificationCriteria[0], /close books faster/i);
    assert.match(target.discoveryQuestions[0], /close books faster/i);
    assert.match(target.buyingSignals.join(" "), /pilot/i);
    assert.match(target.whyRelevant, /Finance leads/);
  });

  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(
      path.join(__dirname, "agent-customer-discovery-target-list.ts"),
      "utf-8",
    );
    const panelSource = readFileSync(
      path.join(__dirname, "components", "venture-customer-discovery-panel.tsx"),
      "utf-8",
    );
    const workbenchSource = readFileSync(
      path.join(__dirname, "components", "agent-venture-workbench-with-form.tsx"),
      "utf-8",
    );
    const combined = `${sourceText}\n${panelSource}\n${workbenchSource}`;
    const combinedImports = Array.from(combined.matchAll(/import[\s\S]*?;/g))
      .map((match) => match[0])
      .join("\n");

    await t.test("helper imports no Supabase, DB, API, runtime, CRM, or server modules", () => {
      assert.ok(!/supabase/i.test(combinedImports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(combinedImports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(combinedImports), "must not import API modules");
      assert.ok(!/runtime/i.test(combinedImports), "must not import runtime modules");
      assert.ok(!/crm/i.test(combinedImports), "must not import CRM modules");
      assert.ok(!/ledger/i.test(combinedImports), "must not import Action Ledger modules");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(combinedImports), "must not import server modules");
    });

    await t.test("helper exports no save, send, or execute paths", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "must not export save functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+send/i), "must not export send functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "must not export execute functions");
    });

    await t.test("UI has no save, approve, execute, send, or CRM handlers", () => {
      assert.ok(!/onSave|handleSave|saveAsCandidate/i.test(combined), "must not expose save handlers");
      assert.ok(!/onApprove|handleApprove/i.test(combined), "must not expose approve handlers");
      assert.ok(!/onExecute|handleExecute/i.test(combined), "must not expose execute handlers");
      assert.ok(!/onSend|handleSend/i.test(combined), "must not expose send handlers");
      assert.ok(!/(onCrm|handleCrm|crmAction)/i.test(combined), "must not expose CRM handlers");
      assert.ok(!/formAction=|action=/.test(combined), "must not expose form actions");
    });
  });
});
