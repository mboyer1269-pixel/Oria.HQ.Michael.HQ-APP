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

test("AgentVentureOffer", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const dataMod = await jiti.import(path.join(__dirname, "agent-venture-workbench-data.ts"));
  const offerMod = await jiti.import(path.join(__dirname, "agent-venture-offer.ts"));
  const { AGENT_VENTURE_WORKBENCH_SEED } = dataMod;
  const { buildAgentVentureOfferDraft, buildAgentVentureOfferDrafts } = offerMod;

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

  await t.test("builds a structured read-only offer draft", () => {
    const item = makeItem({
      id: "wb-offer-001",
      brief: {
        title: "Finance automation offer",
        targetCustomer: "Finance teams at services firms",
        problem: "Manual reporting burns time each week",
        proposedOffer: "A focused reporting and workflow automation pilot",
        estimatedRevenuePotentialCents: 50_000_000,
        estimatedValidationCostCents: 250_000,
        speedToFirstDollarDays: 14,
        validationPlan: {
          firstValidationStep: "Run 5 customer discovery calls",
        },
      },
      profitabilityScore: {
        profitabilityScore: 82,
        recommendation: "prioritize_for_validation",
        blockerCount: 1,
      },
    });

    const draft = buildAgentVentureOfferDraft(item);
    assert.equal(draft.workbenchItemId, "wb-offer-001");
    assert.equal(draft.packageLabel, "Limited pilot package");
    assert.equal(draft.priceHypothesisCents, 29_000);
    assert.equal(draft.priceHypothesisLabel, "$290/mo");
    assert.equal(draft.readOnly, true);
    assert.equal(draft.humanOnTheLoop, true);
    assert.equal(draft.approvalRequired, true);
    assert.equal(draft.noExecutionAuthorized, true);
    assert.equal(draft.packageDeliverables.length, 3);
    assert.match(draft.offerPromise, /Finance teams at services firms/);
    assert.match(draft.reasonToBuyNow, /Fast first-dollar path/);
  });

  await t.test("package and risk guidance change with recommendation", () => {
    const item = makeItem({
      id: "wb-offer-002",
      brief: {
        estimatedRevenuePotentialCents: 5_000_000,
        estimatedValidationCostCents: 1_500_000,
        speedToFirstDollarDays: 60,
      },
      profitabilityScore: {
        profitabilityScore: 41,
        recommendation: "reduce_validation_cost",
        blockerCount: 3,
      },
    });

    const draft = buildAgentVentureOfferDraft(item);
    assert.equal(draft.packageLabel, "Concierge pilot package");
    assert.equal(draft.priceHypothesisCents, 4_900);
    assert.match(draft.riskReduction, /Smaller test/);
    assert.match(draft.mainObjection, /workaround/i);
  });

  await t.test("builder is deterministic and does not mutate the input", () => {
    const item = makeItem();
    const before = clone(item);
    const first = buildAgentVentureOfferDraft(item);
    const second = buildAgentVentureOfferDraft(item);

    assert.deepEqual(first, second);
    assert.deepEqual(item, before);
  });

  await t.test("draft list preserves input order", () => {
    const first = makeItem({
      id: "wb-offer-003",
      brief: {
        title: "First item",
        estimatedRevenuePotentialCents: 20_000_000,
      },
    });
    const second = makeItem({
      id: "wb-offer-004",
      brief: {
        title: "Second item",
        estimatedRevenuePotentialCents: 10_000_000,
      },
    });

    const drafts = buildAgentVentureOfferDrafts([first, second]);
    assert.deepEqual(
      drafts.map((draft) => draft.workbenchItemId),
      ["wb-offer-003", "wb-offer-004"],
    );
  });

  await t.test("Module boundary static source scan", async (t) => {
    const sourceText = readFileSync(path.join(__dirname, "agent-venture-offer.ts"), "utf-8");
    const panelSource = readFileSync(
      path.join(__dirname, "components", "venture-offer-builder-panel.tsx"),
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

    await t.test("helper imports no Supabase, DB, API, runtime, ledger, repository, or server modules", () => {
      assert.ok(!/supabase/i.test(combinedImports), "must not import Supabase");
      assert.ok(!/(^|[/\\])db($|[/\\])/i.test(combinedImports), "must not import db modules");
      assert.ok(!/(^|[/\\])api($|[/\\])/i.test(combinedImports), "must not import API modules");
      assert.ok(!/runtime/i.test(combinedImports), "must not import runtime modules");
      assert.ok(!/ledger/i.test(combinedImports), "must not import Action Ledger modules");
      assert.ok(!/repository|saveVenture|venture-save-action|venture-lifecycle-action/i.test(combinedImports), "must not import repository or write-action modules");
      assert.ok(!/@\/server|src\/server|\.\.\/server/.test(combinedImports), "must not import server modules");
    });

    await t.test("helper exports no save or execute paths", () => {
      assert.ok(!sourceText.match(/\bexport\s+function\s+save/i), "must not export save functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+persist/i), "must not export persist functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+approve/i), "must not export approve functions");
      assert.ok(!sourceText.match(/\bexport\s+function\s+execute/i), "must not export execute functions");
    });

    await t.test("UI has no save, approve, or execute handlers", () => {
      assert.ok(!/onSave|handleSave|saveAsCandidate/i.test(combined), "must not expose save handlers");
      assert.ok(!/onApprove|handleApprove/i.test(combined), "must not expose approve handlers");
      assert.ok(!/onExecute|handleExecute/i.test(combined), "must not expose execute handlers");
      assert.ok(!/formAction=|action=/.test(combined), "must not expose form actions");
    });
  });
});
