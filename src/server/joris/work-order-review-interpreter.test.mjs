#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

test("Work Order Review Interpreter tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const interpreterMod = await jiti.import(path.join(__dirname, "work-order-review-interpreter.ts"));
  const contractMod = await jiti.import(path.join(__dirname, "..", "agents", "work-order-review-contract.ts"));

  const {
    interpretWorkOrderReviewMessage,
    detectForbiddenExecutionLanguage,
    extractRequestedChanges,
  } = interpreterMod;

  const { validateWorkOrderReview, hasForbiddenExecutionFields } = contractMod;

  // Helper to build standard input
  function input(message, overrides) {
    return {
      message,
      workOrderId: "wo_venture_123",
      reviewerId: "michael",
      reviewerRole: "ceo",
      ...overrides,
    };
  }

  // ========================================================================
  // approve_to_plan
  // ========================================================================

  await t.test('"go" maps to approve_to_plan', () => {
    const result = interpretWorkOrderReviewMessage(input("go"));

    assert.equal(result.intent, "approve_to_plan");
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);
    assert.ok(result.review);
    assert.equal(result.review.decision, "approve_to_plan");
  });

  await t.test('"approuve" maps to approve_to_plan', () => {
    const result = interpretWorkOrderReviewMessage(input("approuve"));

    assert.equal(result.intent, "approve_to_plan");
    assert.ok(result.review);
    assert.equal(result.review.decision, "approve_to_plan");
  });

  await t.test('"looks good" maps to approve_to_plan', () => {
    const result = interpretWorkOrderReviewMessage(input("looks good"));

    assert.equal(result.intent, "approve_to_plan");
  });

  await t.test('"oui" maps to approve_to_plan', () => {
    const result = interpretWorkOrderReviewMessage(input("oui"));

    assert.equal(result.intent, "approve_to_plan");
  });

  await t.test("approve_to_plan keeps noExecutionAuthorized true", () => {
    const result = interpretWorkOrderReviewMessage(input("approuvé, c'est bon"));

    assert.equal(result.intent, "approve_to_plan");
    assert.equal(result.noExecutionAuthorized, true);
    assert.equal(result.humanOnTheLoop, true);
    assert.ok(result.review);
    assert.equal(result.review.noExecutionAuthorized, true);
    assert.equal(result.review.humanOnTheLoop, true);
    // Must never be "approve_to_execute"
    assert.notEqual(result.review.decision, "approve_to_execute");
  });

  // ========================================================================
  // request_changes
  // ========================================================================

  await t.test('"change le budget à 50$" maps to request_changes', () => {
    const result = interpretWorkOrderReviewMessage(input("change le budget à 50$"));

    assert.equal(result.intent, "request_changes");
    assert.ok(result.review);
    assert.equal(result.review.decision, "request_changes");
    assert.ok(Array.isArray(result.review.requestedChanges));
    assert.ok(result.review.requestedChanges.length > 0);
  });

  await t.test('"ok mais sans publier" maps to request_changes', () => {
    // "ok mais" triggers change keywords before approval keywords
    const result = interpretWorkOrderReviewMessage(input("ok mais sans publier"));

    // Must NOT execute; must be either request_changes or blocked
    assert.equal(result.noExecutionAuthorized, true);
    assert.ok(
      result.intent === "request_changes" || result.intent === "blocked_execution_request",
      `Expected request_changes or blocked_execution_request, got ${result.intent}`,
    );
  });

  await t.test('"modifie l\'objectif" maps to request_changes', () => {
    const result = interpretWorkOrderReviewMessage(input("modifie l'objectif"));

    assert.equal(result.intent, "request_changes");
  });

  await t.test('"réduis le risque" maps to request_changes', () => {
    const result = interpretWorkOrderReviewMessage(input("réduis le risque"));

    assert.equal(result.intent, "request_changes");
    assert.ok(result.review);
    // Should detect "risque" as a risk-related change
    const changes = result.review.requestedChanges;
    assert.ok(changes.some((c) => c.field === "riskLevel"));
  });

  // ========================================================================
  // reject
  // ========================================================================

  await t.test('"refuse" maps to reject', () => {
    const result = interpretWorkOrderReviewMessage(input("refuse"));

    assert.equal(result.intent, "reject");
    assert.ok(result.review);
    assert.equal(result.review.decision, "reject");
    assert.ok(result.review.reason);
  });

  await t.test('"pas bon" maps to reject', () => {
    const result = interpretWorkOrderReviewMessage(input("pas bon, on abandonne cette idée"));

    assert.equal(result.intent, "reject");
  });

  // ========================================================================
  // ask_for_more_info
  // ========================================================================

  await t.test('"donne-moi plus d\'info" maps to ask_for_more_info', () => {
    const result = interpretWorkOrderReviewMessage(input("donne-moi plus d'info"));

    assert.equal(result.intent, "ask_for_more_info");
    assert.ok(result.review);
    assert.equal(result.review.decision, "ask_for_more_info");
    assert.ok(result.review.reason);
  });

  await t.test('"combien ça coûte" maps to ask_for_more_info', () => {
    const result = interpretWorkOrderReviewMessage(input("combien ça coûte exactement ?"));

    assert.equal(result.intent, "ask_for_more_info");
  });

  await t.test('"pourquoi cet agent" maps to ask_for_more_info', () => {
    const result = interpretWorkOrderReviewMessage(input("pourquoi cet agent et pas un autre ?"));

    assert.equal(result.intent, "ask_for_more_info");
  });

  // ========================================================================
  // blocked_execution_request
  // ========================================================================

  await t.test('"publie maintenant" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("publie maintenant"));

    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.noExecutionAuthorized, true);
    assert.equal(result.humanOnTheLoop, true);
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.some((i) => i.code === "blocked_execution_request"));
  });

  await t.test('"déploie" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("déploie"));

    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.noExecutionAuthorized, true);
  });

  await t.test('"book le rendez-vous" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("book le rendez-vous"));

    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.noExecutionAuthorized, true);
  });

  await t.test('"send" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("send"));

    assert.equal(result.intent, "blocked_execution_request");
  });

  await t.test('"deploy" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("deploy"));

    assert.equal(result.intent, "blocked_execution_request");
  });

  await t.test('"exécute maintenant" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("exécute maintenant le plan"));

    assert.equal(result.intent, "blocked_execution_request");
    assert.equal(result.noExecutionAuthorized, true);
  });

  await t.test('"contacte les prospects" maps to blocked_execution_request', () => {
    const result = interpretWorkOrderReviewMessage(input("contacte les prospects"));

    assert.equal(result.intent, "blocked_execution_request");
  });

  // ========================================================================
  // Missing required fields
  // ========================================================================

  await t.test("missing workOrderId blocks review creation", () => {
    const result = interpretWorkOrderReviewMessage({
      message: "go",
      workOrderId: "",
      reviewerId: "michael",
      reviewerRole: "ceo",
    });

    assert.equal(result.intent, "ambiguous");
    assert.ok(result.issues.some((i) => i.code === "missing_work_order_id"));
    assert.equal(result.review, undefined);
  });

  await t.test("missing reviewerId blocks review creation", () => {
    const result = interpretWorkOrderReviewMessage({
      message: "go",
      workOrderId: "wo_venture_123",
      reviewerId: "",
      reviewerRole: "ceo",
    });

    assert.equal(result.intent, "ambiguous");
    assert.ok(result.issues.some((i) => i.code === "missing_reviewer"));
    assert.equal(result.review, undefined);
  });

  // ========================================================================
  // Ambiguous
  // ========================================================================

  await t.test("ambiguous message asks for clarification", () => {
    const result = interpretWorkOrderReviewMessage(input("hmm je sais pas trop"));

    assert.equal(result.intent, "ambiguous");
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);
    assert.ok(result.summary.includes("préciser") || result.summary.includes("déterminer"));
  });

  // ========================================================================
  // Approval gate acknowledgements
  // ========================================================================

  await t.test("required approval gates are acknowledged on approve_to_plan", () => {
    const result = interpretWorkOrderReviewMessage(input("go", {
      requiredApprovalGates: ["money", "publishing", "deployment"],
    }));

    assert.equal(result.intent, "approve_to_plan");
    assert.ok(result.review);
    assert.ok(Array.isArray(result.review.approvalGateAcknowledgements));
    assert.equal(result.review.approvalGateAcknowledgements.length, 3);

    const gates = result.review.approvalGateAcknowledgements.map((a) => a.gate);
    assert.ok(gates.includes("money"));
    assert.ok(gates.includes("publishing"));
    assert.ok(gates.includes("deployment"));

    // All must be acknowledged
    for (const ack of result.review.approvalGateAcknowledgements) {
      assert.equal(ack.acknowledged, true);
    }
  });

  // ========================================================================
  // Contract validation integration
  // ========================================================================

  await t.test("approve_to_plan output validates with validateWorkOrderReview", () => {
    const result = interpretWorkOrderReviewMessage(input("approuve"));

    assert.ok(result.review);
    const validation = validateWorkOrderReview(result.review);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.issues)}`);
  });

  await t.test("request_changes output validates with validateWorkOrderReview", () => {
    const result = interpretWorkOrderReviewMessage(input("change le budget"));

    assert.ok(result.review);
    const validation = validateWorkOrderReview(result.review);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.issues)}`);
  });

  await t.test("reject output validates with validateWorkOrderReview", () => {
    const result = interpretWorkOrderReviewMessage(input("refuse cette proposition"));

    assert.ok(result.review);
    const validation = validateWorkOrderReview(result.review);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.issues)}`);
  });

  await t.test("ask_for_more_info output validates with validateWorkOrderReview", () => {
    const result = interpretWorkOrderReviewMessage(input("explique les risques"));

    assert.ok(result.review);
    const validation = validateWorkOrderReview(result.review);
    assert.equal(validation.valid, true, `Validation failed: ${JSON.stringify(validation.issues)}`);
  });

  // ========================================================================
  // Immutability
  // ========================================================================

  await t.test("interpreter does not mutate input", () => {
    const reviewInput = input("change le budget à 100€", {
      requiredApprovalGates: ["money"],
    });
    const snapshot = JSON.stringify(reviewInput);
    interpretWorkOrderReviewMessage(reviewInput);
    assert.equal(JSON.stringify(reviewInput), snapshot);
  });

  // ========================================================================
  // No live execution fields
  // ========================================================================

  await t.test("no live execution fields are introduced in review objects", () => {
    const decisions = [
      input("go"),
      input("change le budget"),
      input("refuse"),
      input("explique les risques"),
    ];

    for (const inp of decisions) {
      const result = interpretWorkOrderReviewMessage(inp);
      if (result.review) {
        assert.equal(
          hasForbiddenExecutionFields(result.review),
          false,
          `Review for "${inp.message}" contains forbidden execution fields`,
        );
      }
    }
  });

  // ========================================================================
  // detectForbiddenExecutionLanguage standalone
  // ========================================================================

  await t.test("detectForbiddenExecutionLanguage catches execution keywords", () => {
    assert.ok(detectForbiddenExecutionLanguage("publie") !== null);
    assert.ok(detectForbiddenExecutionLanguage("deploy") !== null);
    assert.ok(detectForbiddenExecutionLanguage("send") !== null);
    assert.ok(detectForbiddenExecutionLanguage("exécute") !== null);
    assert.ok(detectForbiddenExecutionLanguage("book le rendez-vous") !== null);
  });

  await t.test("detectForbiddenExecutionLanguage returns null for clean messages", () => {
    assert.equal(detectForbiddenExecutionLanguage("go"), null);
    assert.equal(detectForbiddenExecutionLanguage("approuve"), null);
    assert.equal(detectForbiddenExecutionLanguage("refuse"), null);
    assert.equal(detectForbiddenExecutionLanguage("donne-moi plus d'info"), null);
  });

  // ========================================================================
  // extractRequestedChanges standalone
  // ========================================================================

  await t.test("extractRequestedChanges extracts budget-related changes", () => {
    const changes = extractRequestedChanges("change le budget à 50€");
    assert.ok(changes.some((c) => c.field === "budgetRequested"));
  });

  await t.test("extractRequestedChanges falls back to general for unknown fields", () => {
    const changes = extractRequestedChanges("ajuste quelque chose");
    assert.ok(changes.some((c) => c.field === "general"));
  });
});
