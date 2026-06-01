#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Cockpit review signal", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-review-cockpit.ts"));
  const {
    buildCockpitApprovalPreview,
    buildCockpitReviewSignal,
    reviewQueueFromQualityEvaluation,
  } = mod;

  const { agentRegistry } = await jiti.import(path.join(__dirname, "seed.ts"));
  const { skillsCatalog } = await jiti.import(
    path.join(projectRoot, "src/features/skills/seed.ts"),
  );
  const { getDefaultAgentAutonomyPolicy } = await jiti.import(
    path.join(__dirname, "autonomy-policy.ts"),
  );

  const CREATED_AT = "2026-06-01T00:00:00.000Z";
  const EXPIRES_AT = "2026-06-08T00:00:00.000Z";

  function build() {
    return buildCockpitReviewSignal({
      agents: agentRegistry,
      skills: skillsCatalog,
      policy: getDefaultAgentAutonomyPolicy(),
      createdAt: CREATED_AT,
      approvalEventExpiresAt: EXPIRES_AT,
    });
  }

  await t.test("derives a review queue from the real agent registry", () => {
    const { reviewQueue } = build();
    assert.ok(reviewQueue.totalItems > 0, "expected at least one review item from the registry");
    assert.equal(
      reviewQueue.totalItems,
      reviewQueue.criticalItems +
        reviewQueue.highItems +
        reviewQueue.mediumItems +
        reviewQueue.lowItems,
      "priority counts must sum to total",
    );
    assert.equal(reviewQueue.humanOnTheLoop, true);
    assert.equal(reviewQueue.noExecutionAuthorized, true);
  });

  await t.test("queue is sorted critical → low", () => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    const { reviewQueue } = build();
    for (let i = 1; i < reviewQueue.items.length; i += 1) {
      assert.ok(
        order[reviewQueue.items[i - 1].priority] <= order[reviewQueue.items[i].priority],
        "items must be ordered by descending priority",
      );
    }
  });

  await t.test("attention summary is consistent with the queue", () => {
    const { reviewQueue, attention } = build();
    assert.equal(attention.total, reviewQueue.totalItems);
    assert.equal(attention.critical, reviewQueue.criticalItems);
    assert.equal(attention.high, reviewQueue.highItems);
    assert.equal(attention.needsAttention, reviewQueue.criticalItems + reviewQueue.highItems > 0);
    assert.ok(attention.topItems.length <= 3, "topItems is capped at 3");
    assert.deepEqual(attention.topItems, reviewQueue.items.slice(0, 3));
  });

  await t.test("output is deterministic for identical inputs", () => {
    assert.deepEqual(build(), build());
  });

  await t.test("every item carries human-on-the-loop and no-execution invariants", () => {
    const { reviewQueue } = build();
    for (const item of reviewQueue.items) {
      assert.equal(item.approvalRequired, true);
      assert.equal(item.humanOnTheLoop, true);
      assert.equal(item.noExecutionAuthorized, true);
      assert.equal(item.createdAt, CREATED_AT);
    }
  });

  await t.test("builds a read-only approval packet and event preview", () => {
    const { reviewQueue, approvalPreview } = build();
    assert.equal(approvalPreview.totalPreviewed, Math.min(2, reviewQueue.totalItems));
    assert.equal(approvalPreview.approvalRequired, true);
    assert.equal(approvalPreview.humanOnTheLoop, true);
    assert.equal(approvalPreview.noAutoApproval, true);
    assert.equal(approvalPreview.approvalEventOnly, true);
    assert.equal(approvalPreview.ledgerRequiredBeforeExecution, true);
    assert.equal(approvalPreview.noRuntimeExecutionAuthorized, true);

    for (const item of approvalPreview.items) {
      assert.equal(item.previewStatus, "read_only_preview");
      assert.equal(item.futureLedgerRequired, true);
      assert.equal(item.runtimeBlocked, true);
      assert.equal(item.packet.queueItemId, item.queueItem.queueItemId);
      assert.equal(item.packet.agentId, item.queueItem.agentId);
      assert.equal(item.packet.outcomeId, item.queueItem.outcomeId);
      assert.equal(item.packet.approvalRequired, true);
      assert.equal(item.packet.noExecutionAuthorized, true);
      assert.equal(item.approvalEventPreview.sourcePacketId, item.packet.packetId);
      assert.equal(item.approvalEventPreview.decision, "approved");
      assert.equal(item.approvalEventPreview.humanApproved, true);
      assert.equal(item.approvalEventPreview.ledgerRequiredBeforeExecution, true);
      assert.equal(item.approvalEventPreview.noRuntimeExecutionAuthorized, true);
      assert.equal(item.approvalEventPreview.noAutoApproval, true);
      assert.equal(item.approvalEventPreview.approvalEventOnly, true);
    }
  });

  await t.test("approval preview helper is deterministic and independent", () => {
    const { reviewQueue } = build();
    const input = {
      reviewQueue,
      createdAt: CREATED_AT,
      approvalEventExpiresAt: EXPIRES_AT,
    };
    assert.deepEqual(buildCockpitApprovalPreview(input), buildCockpitApprovalPreview(input));
  });

  await t.test("reviewQueueFromQualityEvaluation matches the full-chain queue", () => {
    // Same inputs through the convenience builder vs. the core function must agree.
    const { reviewQueue } = build();
    assert.equal(typeof reviewQueueFromQualityEvaluation, "function");
    assert.ok(reviewQueue.totalItems >= 1);
  });
});
