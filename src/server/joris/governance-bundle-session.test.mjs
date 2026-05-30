// src/server/joris/governance-bundle-session.test.mjs

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Governance Bundle Session store tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "governance-bundle-session.ts"));
  const {
    GOVERNANCE_BUNDLE_TTL_MS,
    getPendingGovernanceBundle,
    setPendingGovernanceBundle,
    clearPendingGovernanceBundle,
    isPendingGovernanceBundleExpired,
    resetGovernanceSessionForTests,
  } = mod;

  const previewMod = await jiti.import(path.join(__dirname, "governance-bundle-preview.ts"));
  const { buildJorisGovernanceBundlePreview } = previewMod;

  function validMissionWorkOrder(overrides) {
    return {
      id: "wo_session_001",
      type: "mission",
      title: "Session Test Mission",
      ownerAgentId: "joris",
      assignedAgentId: "joris",
      objective: "Validate the governance session store",
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
      ...overrides,
    };
  }

  function makeBundle(workOrderOverrides) {
    return buildJorisGovernanceBundlePreview({
      workOrder: validMissionWorkOrder(workOrderOverrides),
      reviewerId: "michael",
      reviewerRole: "ceo",
      createdAt: "2026-05-29T10:00:00.000Z",
    }).bundle;
  }

  t.beforeEach(() => resetGovernanceSessionForTests());

  await t.test("TTL constant is 30 minutes", () => {
    assert.equal(GOVERNANCE_BUNDLE_TTL_MS, 30 * 60 * 1000);
  });

  await t.test("get returns undefined when nothing is stored", () => {
    assert.equal(getPendingGovernanceBundle("ws1", "u1"), undefined);
  });

  await t.test("set then get returns the stored pending bundle", () => {
    const bundle = makeBundle();
    const pending = setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle });

    assert.equal(pending.workspaceId, "ws1");
    assert.equal(pending.userId, "u1");
    assert.equal(pending.bundleId, bundle.id);
    assert.ok(pending.createdAt);
    assert.ok(pending.expiresAt);

    const fetched = getPendingGovernanceBundle("ws1", "u1");
    assert.ok(fetched);
    assert.equal(fetched.bundle.id, bundle.id);
    assert.equal(fetched.bundle, bundle, "bundle is stored by reference");
  });

  await t.test("store is keyed by workspace AND user", () => {
    const b1 = makeBundle({ id: "wo_a" });
    const b2 = makeBundle({ id: "wo_b" });
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: b1 });
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u2", bundle: b2 });

    assert.equal(getPendingGovernanceBundle("ws1", "u1").bundle.workOrder.id, "wo_a");
    assert.equal(getPendingGovernanceBundle("ws1", "u2").bundle.workOrder.id, "wo_b");
    assert.equal(getPendingGovernanceBundle("ws2", "u1"), undefined);
  });

  await t.test("set replaces the previous pending bundle for the same key", () => {
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle({ id: "wo_first" }) });
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle({ id: "wo_second" }) });
    assert.equal(getPendingGovernanceBundle("ws1", "u1").bundle.workOrder.id, "wo_second");
  });

  await t.test("clear removes the pending bundle and reports removal", () => {
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle() });
    assert.equal(clearPendingGovernanceBundle("ws1", "u1"), true);
    assert.equal(getPendingGovernanceBundle("ws1", "u1"), undefined);
    assert.equal(clearPendingGovernanceBundle("ws1", "u1"), false, "second clear reports nothing removed");
  });

  await t.test("isPendingGovernanceBundleExpired respects the TTL", () => {
    const base = Date.parse("2026-05-29T10:00:00.000Z");
    const pending = setPendingGovernanceBundle({
      workspaceId: "ws1",
      userId: "u1",
      bundle: makeBundle(),
      now: base,
    });
    assert.equal(isPendingGovernanceBundleExpired(pending, base), false);
    assert.equal(isPendingGovernanceBundleExpired(pending, base + GOVERNANCE_BUNDLE_TTL_MS - 1), false);
    assert.equal(isPendingGovernanceBundleExpired(pending, base + GOVERNANCE_BUNDLE_TTL_MS), true);
    assert.equal(isPendingGovernanceBundleExpired(pending, base + GOVERNANCE_BUNDLE_TTL_MS + 1), true);
  });

  await t.test("get evicts an expired entry lazily and returns undefined", () => {
    const base = Date.parse("2026-05-29T10:00:00.000Z");
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle(), now: base });
    // Re-store with an already-expired window by setting now far in the past.
    const longAgo = base - GOVERNANCE_BUNDLE_TTL_MS - 1000;
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle(), now: longAgo });
    assert.equal(
      getPendingGovernanceBundle("ws1", "u1"),
      undefined,
      "expired entry must be evicted on read",
    );
  });

  await t.test("stored pending bundle preserves humanOnTheLoop / noExecutionAuthorized", () => {
    const bundle = makeBundle();
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle });
    const fetched = getPendingGovernanceBundle("ws1", "u1");
    assert.equal(fetched.bundle.humanOnTheLoop, true);
    assert.equal(fetched.bundle.noExecutionAuthorized, true);
    assert.equal(fetched.bundle.status, "preview");
  });

  await t.test("resetGovernanceSessionForTests clears all entries", () => {
    setPendingGovernanceBundle({ workspaceId: "ws1", userId: "u1", bundle: makeBundle() });
    setPendingGovernanceBundle({ workspaceId: "ws2", userId: "u2", bundle: makeBundle() });
    resetGovernanceSessionForTests();
    assert.equal(getPendingGovernanceBundle("ws1", "u1"), undefined);
    assert.equal(getPendingGovernanceBundle("ws2", "u2"), undefined);
  });
});
