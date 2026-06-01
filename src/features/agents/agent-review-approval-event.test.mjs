#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Agent review approval event", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const packetMod = await jiti.import(
    path.join(__dirname, "agent-review-approval-packet.ts"),
  );
  const buildPacket = packetMod.buildAgentReviewApprovalPacket;

  const eventMod = await jiti.import(
    path.join(__dirname, "agent-review-approval-event.ts"),
  );
  const buildEvent = eventMod.buildAgentReviewApprovalEvent;
  const validateEvent = eventMod.validateAgentReviewApprovalEvent;

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

  function makePacket(overrides = {}) {
    return buildPacket({ queueItem: makeQueueItem(overrides), createdAt: CREATED_AT });
  }

  function makeApprovedEvent(extra = {}) {
    return buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "approved",
      decisionRationale: ["Reviewed the evidence; controlled expansion review is warranted."],
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      ...extra,
    });
  }

  // ----- 1. Builds a valid approved event from a packet -----
  await t.test("builds a valid approved event from a packet", () => {
    const event = makeApprovedEvent();
    assert.equal(event.decision, "approved");
    assert.equal(event.sourcePacketId, makePacket().packetId);
    assert.equal(event.sourceQueueItemId, "review-joris-outcome-001-0");
    assert.equal(event.agentId, "joris");
    assert.equal(event.outcomeId, "outcome-001");
    assert.equal(event.reviewerId, "usr_michael");
    assert.equal(event.reviewerRole, "ceo");
    assert.equal(event.status, "valid_human_decision");
    assert.ok(event.approvedScope, "approved event must carry approvedScope");
    assert.equal(event.approvedScope.maxRiskLevel, makePacket().riskSummary.level);
    assert.equal(event.approvedScope.expiresAt, EXPIRES_AT);
    assert.ok(event.approvalEventId.startsWith("approval-event-"));
    const result = validateEvent(event);
    assert.equal(result.valid, true, `expected valid, got: ${result.errors.join("; ")}`);
  });

  // ----- 2. Approved event has humanApproved true -----
  await t.test("approved event has humanApproved true", () => {
    assert.equal(makeApprovedEvent().humanApproved, true);
  });

  // ----- 3. Approved event still has ledgerRequiredBeforeExecution true -----
  await t.test("approved event still requires ledger before execution", () => {
    assert.equal(makeApprovedEvent().ledgerRequiredBeforeExecution, true);
  });

  // ----- 4. Approved event still has noRuntimeExecutionAuthorized true -----
  await t.test("approved event still has noRuntimeExecutionAuthorized true", () => {
    const event = makeApprovedEvent();
    assert.equal(event.noRuntimeExecutionAuthorized, true);
    assert.equal(event.noAutoApproval, true);
    assert.equal(event.approvalEventOnly, true);
  });

  // ----- 5. Rejected event has humanApproved false -----
  await t.test("rejected event has humanApproved false", () => {
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "rejected",
      decisionRationale: ["Not enough confidence to expand."],
      createdAt: CREATED_AT,
    });
    assert.equal(event.humanApproved, false);
    assert.equal(event.status, "valid_human_decision");
    assert.equal(event.approvedScope, undefined);
    assert.equal(validateEvent(event).valid, true);
  });

  // ----- 6. Needs-more-evidence event has humanApproved false -----
  await t.test("needs_more_evidence event has humanApproved false", () => {
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "operator",
      decision: "needs_more_evidence",
      decisionRationale: ["Collect more reviewed outputs first."],
      createdAt: CREATED_AT,
    });
    assert.equal(event.humanApproved, false);
    assert.equal(validateEvent(event).valid, true);
  });

  // ----- 7. Expired event has humanApproved false -----
  await t.test("expired event has humanApproved false", () => {
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "expired",
      createdAt: CREATED_AT,
    });
    assert.equal(event.humanApproved, false);
    assert.equal(event.status, "expired");
    assert.equal(validateEvent(event).valid, true);
  });

  // ----- 8. Revoked event has humanApproved false -----
  await t.test("revoked event has humanApproved false", () => {
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "revoked",
      createdAt: CREATED_AT,
    });
    assert.equal(event.humanApproved, false);
    assert.equal(event.status, "revoked");
    assert.equal(validateEvent(event).valid, true);
  });

  // ----- 9. Missing reviewerId fails for approved -----
  await t.test("missing reviewerId fails for approved", () => {
    const event = makeApprovedEvent({ reviewerId: "" });
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("reviewerId")));
  });

  // ----- 10. Missing reviewerRole fails for approved -----
  await t.test("missing reviewerRole fails for approved", () => {
    const event = makeApprovedEvent({ reviewerRole: "" });
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("reviewerRole")));
  });

  // ----- 11. Missing decisionRationale fails for approved -----
  await t.test("missing decisionRationale fails for approved", () => {
    const event = makeApprovedEvent({ decisionRationale: [] });
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("decisionRationale")));
  });

  // ----- 12. Missing expiresAt fails for approved -----
  await t.test("missing expiresAt fails for approved", () => {
    const event = makeApprovedEvent({ expiresAt: undefined });
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("expiresAt")));
  });

  // ----- 13. Missing approvedScope fails for approved -----
  await t.test("missing approvedScope fails for approved", () => {
    const event = makeApprovedEvent();
    delete event.approvedScope;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("approvedScope")));
  });

  // ----- 14. humanApproved true with rejected decision fails -----
  await t.test("humanApproved true with rejected decision fails", () => {
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "rejected",
      decisionRationale: ["Rejected."],
      createdAt: CREATED_AT,
    });
    event.humanApproved = true;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("humanApproved")));
  });

  // ----- 15. ledgerRequiredBeforeExecution false fails -----
  await t.test("ledgerRequiredBeforeExecution false fails", () => {
    const event = makeApprovedEvent();
    event.ledgerRequiredBeforeExecution = false;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("ledgerRequiredBeforeExecution")));
  });

  // ----- 16. noRuntimeExecutionAuthorized false fails -----
  await t.test("noRuntimeExecutionAuthorized false fails", () => {
    const event = makeApprovedEvent();
    event.noRuntimeExecutionAuthorized = false;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("noRuntimeExecutionAuthorized")));
  });

  // ----- 17. noAutoApproval false fails -----
  await t.test("noAutoApproval false fails", () => {
    const event = makeApprovedEvent();
    event.noAutoApproval = false;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("noAutoApproval")));
  });

  // ----- 18. approvalEventOnly false fails -----
  await t.test("approvalEventOnly false fails", () => {
    const event = makeApprovedEvent();
    event.approvalEventOnly = false;
    const result = validateEvent(event);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("approvalEventOnly")));
  });

  // ----- 19. Output is deterministic -----
  await t.test("output is deterministic", () => {
    const input = {
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "approved",
      decisionRationale: ["Same input."],
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    };
    assert.deepEqual(buildEvent(input), buildEvent(input));
  });

  // ----- 20. Function does not mutate packet input -----
  await t.test("function does not mutate packet input", () => {
    const packet = makePacket({ riskFlags: ["high_guardrail_violations"] });
    const snapshot = structuredClone(packet);
    buildEvent({
      packet,
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "approved",
      decisionRationale: ["No mutation."],
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
    });
    assert.deepEqual(packet, snapshot);
  });

  // ----- 21. Arrays are copied, not referenced -----
  await t.test("arrays are copied not referenced", () => {
    const rationale = ["original"];
    const constraints = [{ id: "c1", description: "stay within scope" }];
    const event = buildEvent({
      packet: makePacket(),
      reviewerId: "usr_michael",
      reviewerRole: "ceo",
      decision: "approved",
      decisionRationale: rationale,
      createdAt: CREATED_AT,
      expiresAt: EXPIRES_AT,
      constraints,
    });
    assert.notEqual(event.decisionRationale, rationale);
    assert.notEqual(event.constraints, constraints);
    assert.notEqual(event.constraints[0], constraints[0]);
    event.decisionRationale.push("mutated");
    event.constraints.push({ id: "c2", description: "x" });
    assert.equal(rationale.length, 1);
    assert.equal(constraints.length, 1);
  });

  // ----- 22. Guardrails explicitly mention no ledger, no runtime, no autonomy -----
  await t.test("guardrails explicitly state no ledger write, no runtime execution, no autonomy mutation", () => {
    const event = makeApprovedEvent();
    assert.ok(Array.isArray(event.guardrails) && event.guardrails.length > 0);
    const combined = event.guardrails.join(" ").toLowerCase();
    assert.ok(combined.includes("does not write to the action ledger"), "must state no ledger write");
    assert.ok(combined.includes("does not authorize runtime execution"), "must state no runtime execution");
    assert.ok(combined.includes("does not mutate agent autonomy"), "must state no autonomy mutation");
  });

  // ----- 23. Module imports no DB/Supabase/API/runtime/network/fs/ledger dependency -----
  await t.test("module imports no DB, Supabase, API, runtime, network, filesystem, or ledger dependency", () => {
    const source = readFileSync(
      path.join(__dirname, "agent-review-approval-event.ts"),
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
    const codeOnly = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    assert.ok(!/Date\.now\(\)/.test(codeOnly), "module must not call Date.now() in executable code");
  });

  // ----- 24. Existing approval packet builder is unchanged -----
  await t.test("existing approval packet builder is unchanged", () => {
    const packet = makePacket();
    assert.equal(packet.approvalRequired, true);
    assert.equal(packet.humanOnTheLoop, true);
    assert.equal(packet.noExecutionAuthorized, true);
    assert.ok(!("approved" in packet), "packet must not carry an approved field");
  });
});
