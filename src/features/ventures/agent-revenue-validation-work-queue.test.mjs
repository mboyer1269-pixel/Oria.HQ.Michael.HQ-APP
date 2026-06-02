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

test("AgentRevenueValidationWorkQueue", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const dataMod = await jiti.import(path.join(__dirname, "agent-venture-workbench-data.ts"));
  const queueMod = await jiti.import(path.join(__dirname, "agent-revenue-validation-work-queue.ts"));
  const { AGENT_VENTURE_WORKBENCH_SEED } = dataMod;
  const { buildAgentRevenueValidationWorkQueue } = queueMod;

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

  await t.test("builds a ranked, role-assigned, read-only work queue", () => {
    const low = makeItem({
      id: "wb-work-002",
      brief: {
        title: "Lower priority",
        targetCustomer: "Local teams",
        problem: "Need a workflow improvement",
        validationPlan: {
          validationChannel: "community interviews",
          firstValidationStep: "Talk to 3 teams",
        },
      },
      profitabilityScore: {
        profitabilityScore: 36,
        recommendation: "reject_for_now",
        blockerCount: 3,
        nextCeoDecision: "Hold off on queueing work",
      },
    });

    const high = makeItem({
      id: "wb-work-001",
      brief: {
        title: "Higher priority",
        targetCustomer: "SaaS founders",
        problem: "Need faster onboarding validation",
        validationPlan: {
          validationChannel: "founder communities",
          firstValidationStep: "Run 5 discovery calls",
        },
      },
      profitabilityScore: {
        profitabilityScore: 86,
        recommendation: "prioritize_for_validation",
        blockerCount: 1,
        nextCeoDecision: "Run the validation queue first",
      },
    });

    const queue = buildAgentRevenueValidationWorkQueue([low, high]);
    assert.equal(queue.length, 2);
    assert.equal(queue[0].workbenchItemId, "wb-work-001");
    assert.equal(queue[0].readOnly, true);
    assert.equal(queue[0].humanOnTheLoop, true);
    assert.equal(queue[0].approvalRequired, true);
    assert.equal(queue[0].noExecutionAuthorized, true);
    assert.equal(queue[0].workTasks.length, 5);
    assert.deepEqual(queue[0].handoffSequence, ["Research Agent", "Offer Agent", "Sales Agent", "Ops Agent", "Finance Agent"]);
    assert.match(queue[0].priorityReason, /Assigned roles/i);
    assert.match(queue[0].workTasks[0].task, /SaaS founders/);
  });

  await t.test("builder is deterministic and does not mutate the input", () => {
    const item = makeItem();
    const before = clone(item);
    const first = buildAgentRevenueValidationWorkQueue([item]);
    const second = buildAgentRevenueValidationWorkQueue([item]);

    assert.deepEqual(first, second);
    assert.deepEqual(item, before);
  });

  await t.test("smaller recommendations get shorter work queues", () => {
    const item = makeItem({
      profitabilityScore: {
        profitabilityScore: 40,
        recommendation: "gather_more_evidence",
        blockerCount: 2,
        nextCeoDecision: "Gather evidence first",
      },
    });

    const [queueItem] = buildAgentRevenueValidationWorkQueue([item]);
    assert.ok(queueItem.workTasks.length <= 2);
    assert.match(queueItem.workTasks[0].role, /Research Agent/);
  });

  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "agent-revenue-validation-work-queue.ts"), "utf-8");
    const panelSource = readFileSync(
      path.join(__dirname, "components", "venture-revenue-validation-work-queue-panel.tsx"),
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
