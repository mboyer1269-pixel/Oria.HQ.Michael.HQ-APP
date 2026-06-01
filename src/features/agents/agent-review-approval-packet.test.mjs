#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent review approval packet", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(
    path.join(__dirname, "agent-review-approval-packet.ts"),
  );
  const build = mod.buildAgentReviewApprovalPacket;

  const CREATED_AT = "2026-06-01T12:00:00.000Z";
  const EXPIRES_AT = "2026-06-08T12:00:00.000Z";

  function makeQueueItem(overrides = {}) {
    return {
      queueItemId: "review-joris-outcome-001-0",
      agentId: "joris",
      outcomeId: "outcome-001",
      priority: "medium",
      status: "pending_review",
      decision: "eligible_for_controlled_expansion",
      riskFlags: [],
      nextAction: "prepare_controlled_expansion_proposal",
      rationale: ["Strong quality, clean guardrails, sufficient reviewed outputs."],
      executiveSummary:
        "Agent joris shows strong signals and may be eligible for a controlled expansion proposal — human approval required.",
      approvalRequired: true,
      humanOnTheLoop: true,
      noExecutionAuthorized: true,
      createdAt: CREATED_AT,
      ...overrides,
    };
  }

  // ----- 1. Builds a packet from a critical queue item -----
  await t.test("builds a packet from a critical queue item", () => {
    const item = makeQueueItem({
      priority: "critical",
      decision: "reduce_autonomy_recommendation",
      riskFlags: ["high_guardrail_violations"],
      nextAction: "reduce_autonomy_and_escalate",
      rationale: ["3 guardrail violations observed."],
      executiveSummary: "Critical: agent must be reviewed for autonomy reduction.",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.agentId, "joris");
    assert.equal(packet.queueItemId, item.queueItemId);
    assert.equal(packet.priority, "critical");
    assert.equal(packet.requestedDecision, "reject_or_reduce_autonomy");
    assert.equal(packet.sourceDecision, "reduce_autonomy_recommendation");
    assert.equal(packet.status, "ready_for_human_review");
    assert.equal(packet.riskSummary.level, "critical");
    assert.equal(packet.requiredReview.requiredReview, "ceo_review_required");
    assert.equal(packet.approvalRequired, true);
    assert.equal(packet.humanOnTheLoop, true);
    assert.equal(packet.noExecutionAuthorized, true);
    assert.ok(packet.packetId.startsWith("packet-"));
    assert.equal(packet.createdAt, CREATED_AT);
  });

  // ----- 2. Builds a packet from eligible expansion without approving -----
  await t.test("builds packet from eligible controlled expansion item without approving it", () => {
    const packet = build({ queueItem: makeQueueItem(), createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "approve_controlled_expansion_review");
    assert.equal(packet.sourceDecision, "eligible_for_controlled_expansion");
    assert.equal(packet.approvalRequired, true);
    assert.equal(packet.humanOnTheLoop, true);
    assert.equal(packet.noExecutionAuthorized, true);
    // The packet itself is not an approval
    assert.ok(
      !("approved" in packet),
      "packet must not carry an approved field",
    );
    assert.ok(
      !("executionAuthorized" in packet),
      "packet must not carry executionAuthorized",
    );
  });

  // ----- 3. block_autonomy_increase maps correctly -----
  await t.test("block_autonomy_increase decision maps to block_autonomy_increase packet decision", () => {
    const item = makeQueueItem({
      priority: "critical",
      decision: "block_autonomy_increase",
      riskFlags: ["high_or_critical_risk"],
      nextAction: "hold_autonomy_and_escalate",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "block_autonomy_increase");
    assert.equal(packet.sourceDecision, "block_autonomy_increase");
    assert.equal(packet.riskSummary.level, "critical");
  });

  // ----- 4. reduce_autonomy_recommendation maps to reject_or_reduce_autonomy -----
  await t.test("reduce_autonomy_recommendation maps to reject_or_reduce_autonomy", () => {
    const item = makeQueueItem({
      priority: "critical",
      decision: "reduce_autonomy_recommendation",
      riskFlags: ["high_guardrail_violations"],
      nextAction: "reduce_autonomy_and_escalate",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "reject_or_reduce_autonomy");
  });

  // ----- 5. require_more_observations maps to approve_more_observation_collection -----
  await t.test("medium require_more_observations maps to approve_more_observation_collection", () => {
    const item = makeQueueItem({
      priority: "medium",
      decision: "require_more_observations",
      riskFlags: ["insufficient_reviewed_outputs"],
      nextAction: "collect_more_observations",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "approve_more_observation_collection");
    assert.equal(packet.status, "blocked_pending_more_evidence");
    assert.equal(packet.requiredReview.requiredReview, "more_evidence_required");
  });

  // ----- 6. continue_monitoring maps to approve_continue_monitoring -----
  await t.test("low continue_monitoring maps to approve_continue_monitoring", () => {
    const item = makeQueueItem({
      priority: "low",
      decision: "continue_monitoring",
      riskFlags: [],
      nextAction: "keep_monitoring",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "approve_continue_monitoring");
    assert.equal(packet.riskSummary.level, "low");
    assert.equal(packet.requiredReview.requiredReview, "routine_review_required");
    assert.equal(packet.status, "draft_for_human_review");
  });

  // ----- 7. approvalRequired is always true -----
  await t.test("packet always has approvalRequired true", () => {
    const decisions = [
      { priority: "critical", decision: "reduce_autonomy_recommendation", riskFlags: ["high_guardrail_violations"], nextAction: "reduce_autonomy_and_escalate" },
      { priority: "medium", decision: "eligible_for_controlled_expansion", riskFlags: [], nextAction: "prepare_controlled_expansion_proposal" },
      { priority: "low", decision: "continue_monitoring", riskFlags: [], nextAction: "keep_monitoring" },
    ];
    for (const overrides of decisions) {
      const packet = build({ queueItem: makeQueueItem(overrides), createdAt: CREATED_AT });
      assert.equal(packet.approvalRequired, true, `approvalRequired must be true for decision ${overrides.decision}`);
      assert.equal(packet.requiredReview.approvalRequired, true);
      assert.equal(packet.requiredReview.noAutoApproval, true);
    }
  });

  // ----- 8. humanOnTheLoop is always true -----
  await t.test("packet always has humanOnTheLoop true", () => {
    const packet = build({ queueItem: makeQueueItem(), createdAt: CREATED_AT });
    assert.equal(packet.humanOnTheLoop, true);
  });

  // ----- 9. noExecutionAuthorized is always true -----
  await t.test("packet always has noExecutionAuthorized true", () => {
    const packet = build({ queueItem: makeQueueItem(), createdAt: CREATED_AT });
    assert.equal(packet.noExecutionAuthorized, true);
    assert.equal(packet.riskSummary.requiresLedgerBeforeExecution, true);
    assert.equal(packet.requiredReview.ledgerEntryRequiredBeforeExecution, true);
  });

  // ----- 10. Guardrails explicitly state no approval/execution/autonomy mutation -----
  await t.test("packet guardrails explicitly state no approval, no execution, no autonomy mutation", () => {
    const packet = build({ queueItem: makeQueueItem(), createdAt: CREATED_AT });

    assert.ok(Array.isArray(packet.guardrails) && packet.guardrails.length > 0);
    const combined = packet.guardrails.join(" ").toLowerCase();
    assert.ok(combined.includes("does not constitute approval"), "must state no approval");
    assert.ok(combined.includes("does not authorize runtime execution"), "must state no execution");
    assert.ok(combined.includes("does not mutate agent autonomy"), "must state no autonomy mutation");
    assert.ok(combined.includes("action ledger"), "must reference Action Ledger requirement");
  });

  // ----- 11. Output is deterministic -----
  await t.test("output is deterministic", () => {
    const input = { queueItem: makeQueueItem(), createdAt: CREATED_AT };
    const a = build(input);
    const b = build(input);
    assert.deepEqual(a, b);
  });

  // ----- 12. Function does not mutate input -----
  await t.test("function does not mutate input", () => {
    const input = { queueItem: makeQueueItem(), createdAt: CREATED_AT };
    const snapshot = structuredClone(input);
    build(input);
    assert.deepEqual(input, snapshot);
  });

  // ----- 13. Arrays are copied, not referenced -----
  await t.test("arrays are copied not referenced", () => {
    const item = makeQueueItem({
      riskFlags: ["high_guardrail_violations"],
      rationale: ["test rationale"],
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.notEqual(packet.riskSummary.riskFlags, item.riskFlags);
    assert.notEqual(packet.rationale, item.rationale);
    assert.notEqual(packet.guardrails, undefined);
    // Mutating the packet's arrays must not affect a second build
    packet.riskSummary.riskFlags.push("no_realized_value");
    const packet2 = build({ queueItem: item, createdAt: CREATED_AT });
    assert.equal(packet2.riskSummary.riskFlagCount, 1);
  });

  // ----- 14. expiresAt is optional and forwarded when provided -----
  await t.test("expiresAt is optional and forwarded when provided", () => {
    const withExpiry = build({
      queueItem: makeQueueItem(),
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.equal(withExpiry.expiresAt, EXPIRES_AT);

    const withoutExpiry = build({ queueItem: makeQueueItem(), createdAt: CREATED_AT });
    assert.equal(withoutExpiry.expiresAt, undefined);
  });

  // ----- 15. improve_knowledge_pack maps correctly -----
  await t.test("improve_knowledge_pack maps to approve_knowledge_pack_improvement_review", () => {
    const item = makeQueueItem({
      priority: "medium",
      decision: "improve_knowledge_pack",
      riskFlags: ["low_quality_score"],
      nextAction: "schedule_knowledge_pack_review",
    });
    const packet = build({ queueItem: item, createdAt: CREATED_AT });

    assert.equal(packet.requestedDecision, "approve_knowledge_pack_improvement_review");
    assert.equal(packet.riskSummary.level, "elevated");
    assert.equal(packet.requiredReview.requiredReview, "operator_review_required");
  });

  // ----- 16. Module imports no DB, Supabase, API, runtime, network, filesystem, Action Ledger write -----
  await t.test("module imports no DB, Supabase, API, runtime, network, or filesystem dependency", () => {
    const source = readFileSync(
      path.join(__dirname, "agent-review-approval-packet.ts"),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    const importBlob = importLines.join("\n").toLowerCase();

    for (const forbidden of [
      "supabase",
      "runtime",
      "execution",
      "ledger",
      "/api/",
      "node:fs",
      "node:net",
      "node:http",
    ]) {
      assert.ok(
        !importBlob.includes(forbidden),
        `unexpected dependency on "${forbidden}" in imports`,
      );
    }
    assert.ok(!/\bfetch\s*\(/.test(source), "module must not call fetch");
    assert.ok(!/node:fs\b/.test(source), "module must not touch the filesystem");
    // Strip single-line and block comments before checking Date.now() —
    // the JSDoc in the source describes the constraint but must not call it.
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.ok(!/Date\.now\(\)/.test(codeOnly), "module must not call Date.now() in executable code");
  });

  // ----- 17. Does not modify existing queue builder behavior -----
  await t.test("does not modify existing queue builder behavior", async () => {
    const queueMod = await jiti.import(
      path.join(__dirname, "agent-review-queue.ts"),
    );
    // The queue module loads independently and exports buildAgentReviewQueue unchanged
    assert.equal(typeof queueMod.buildAgentReviewQueue, "function");
    const queue = queueMod.buildAgentReviewQueue({ items: [], createdAt: CREATED_AT });
    assert.equal(queue.totalItems, 0);
    assert.equal(queue.humanOnTheLoop, true);
    assert.equal(queue.noExecutionAuthorized, true);
  });
});
