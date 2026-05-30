// src/server/joris/governance-decision-repository.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Governance Decision repository tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const repoMod = await jiti.import(path.join(__dirname, "governance-decision-repository.ts"));
  const {
    recordGovernanceDecision,
    getGovernanceDecisionsForWorkspace,
    getGovernanceDecisionsForWorkOrder,
    getLatestGovernanceDecision,
    __clearGovernanceDecisionsForTests,
  } = repoMod;

  const contractMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/work-order-governance-decision-contract.ts"),
  );
  const { buildGovernanceDecisionRecord } = contractMod;

  const previewMod = await jiti.import(path.join(__dirname, "governance-bundle-preview.ts"));
  const { buildJorisGovernanceBundlePreview } = previewMod;

  const applicatorMod = await jiti.import(
    path.join(__dirname, "governance-bundle-review-applicator.ts"),
  );
  const { applyReviewToGovernanceBundle } = applicatorMod;

  function workOrder(id) {
    return {
      id,
      type: "mission",
      title: "Repo Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate the decision repository",
      expectedOutput: { description: "Test report", outputType: "report" },
      boostersRequested: [],
      riskLevel: "low",
      approvalGates: [],
      successMetric: { description: "Tests pass" },
      nextAction: { description: "Review output", actor: "joris" },
      businessValue: { valueType: "learning", confidence: "low" },
      status: "draft",
      createdByType: "joris",
      createdById: "joris",
      createdAt: "2026-05-29T10:00:00.000Z",
    };
  }

  function decisionRecord(workspaceId, woId, message) {
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: workOrder(woId),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
    const application = applyReviewToGovernanceBundle({
      bundle: preview,
      message,
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T11:00:00.000Z",
    });
    assert.equal(application.applied, true);
    return buildGovernanceDecisionRecord({ bundle: application.bundle, workspaceId });
  }

  t.beforeEach(() => __clearGovernanceDecisionsForTests());

  await t.test("records a valid decision and returns a copy", () => {
    const record = decisionRecord("ws1", "wo_1", "Approuve pour le plan");
    const stored = recordGovernanceDecision(record);
    assert.equal(stored.id, record.id);
    assert.equal(stored.outcome, "approved_to_plan");
    assert.notEqual(stored, record, "returns a defensive copy, not the same reference");
  });

  await t.test("getGovernanceDecisionsForWorkspace returns most-recent first", () => {
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    const list = getGovernanceDecisionsForWorkspace("ws1");
    assert.equal(list.length, 2);
    assert.equal(list[0].workOrderId, "wo_2", "most recent first");
    assert.equal(list[1].workOrderId, "wo_1");
  });

  await t.test("workspace isolation: decisions do not leak across workspaces", () => {
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    recordGovernanceDecision(decisionRecord("ws2", "wo_9", "Approuve pour le plan"));
    assert.equal(getGovernanceDecisionsForWorkspace("ws1").length, 1);
    assert.equal(getGovernanceDecisionsForWorkspace("ws2").length, 1);
    assert.equal(getGovernanceDecisionsForWorkspace("ws3").length, 0);
  });

  await t.test("getGovernanceDecisionsForWorkOrder filters by work order", () => {
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Modifie le budget stp"));
    recordGovernanceDecision(decisionRecord("ws1", "wo_2", "Non, rejette cette idée"));
    const list = getGovernanceDecisionsForWorkOrder("ws1", "wo_1");
    assert.equal(list.length, 2);
    assert.ok(list.every((r) => r.workOrderId === "wo_1"));
  });

  await t.test("getLatestGovernanceDecision returns the most recent or null", () => {
    assert.equal(getLatestGovernanceDecision("ws1", "wo_1"), null);
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Non, rejette cette idée"));
    const latest = getLatestGovernanceDecision("ws1", "wo_1");
    assert.ok(latest);
    assert.equal(latest.outcome, "rejected");
  });

  await t.test("refuses to persist an invalid record (non-decided outcome)", () => {
    // A preview bundle yields outcome "preview" → invalid.
    const preview = buildJorisGovernanceBundlePreview({
      workOrder: workOrder("wo_bad"),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
    const invalid = buildGovernanceDecisionRecord({ bundle: preview, workspaceId: "ws1" });
    assert.throws(
      () => recordGovernanceDecision(invalid),
      /invalid governance decision record/i,
    );
    assert.equal(getGovernanceDecisionsForWorkspace("ws1").length, 0);
  });

  await t.test("stored records preserve no-execution invariants", () => {
    recordGovernanceDecision(decisionRecord("ws1", "wo_1", "Approuve pour le plan"));
    const [rec] = getGovernanceDecisionsForWorkspace("ws1");
    assert.equal(rec.humanOnTheLoop, true);
    assert.equal(rec.noExecutionAuthorized, true);
  });

  await t.test("production without local fallback refuses to persist (loud, not silent)", () => {
    const record = decisionRecord("ws1", "wo_1", "Approuve pour le plan");
    const prevNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.throws(
        () => recordGovernanceDecision(record),
        /not yet configured/i,
        "must throw in production without a Supabase implementation",
      );
    } finally {
      process.env.NODE_ENV = prevNodeEnv;
    }
    // Back in non-production, persistence works again.
    const stored = recordGovernanceDecision(record);
    assert.equal(stored.outcome, "approved_to_plan");
  });
});
