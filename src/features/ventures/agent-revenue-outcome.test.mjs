#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

function makeEvidence(overrides = {}) {
  return {
    kind: "email_reply",
    referenceId: "ref-001",
    isVerified: true,
    source: "shared inbox",
    capturedAt: "2026-06-02T00:00:00.000Z",
    summary: "Buyer replied confirming interest and asked for pricing",
    ...overrides,
  };
}

function makeFinancialEvidence(overrides = {}) {
  return makeEvidence({
    kind: "stripe_charge",
    referenceId: "ch_test_001",
    summary: "Stripe charge captured for the paid pilot",
    ...overrides,
  });
}

function makeSignal(overrides = {}) {
  return {
    score: 70,
    basis: "agent observed a concrete signal",
    evidence: [makeEvidence()],
    ...overrides,
  };
}

function makeOutcome(overrides = {}) {
  return {
    outcomeId: "outcome-001",
    agentId: "agent-001",
    ventureId: "venture-001",
    taskId: "task-001",
    customerProof: makeSignal({ score: 65 }),
    paymentSignal: makeSignal({ score: 55, evidence: [] }),
    painClarity: makeSignal({ score: 80 }),
    buyerIdentifiability: makeSignal({ score: 60 }),
    offerTestability: makeSignal({ score: 40, evidence: [] }),
    cashProximity: makeSignal({ score: 50, evidence: [] }),
    cashGenerated: {
      amountCents: 0,
      verified: false,
      evidence: [],
    },
    evidenceSummary: "Two of three target buyers confirmed the pain and asked for pricing.",
    nextCashAction: {
      actionLabel: "send a paid pilot offer to the two warm buyers",
      rationale: "they asked for pricing — convert interest to a payment signal",
    },
    createdAt: "2026-06-02T00:00:00.000Z",
    humanOnTheLoop: true,
    approvalRequired: true,
    noExecutionAuthorized: true,
    ...overrides,
  };
}

test("AgentRevenueOutcome model", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(path.join(__dirname, "agent-revenue-outcome.ts"));
  const {
    validateAgentRevenueOutcome,
    buildAgentRevenueOutcome,
    AGENT_REVENUE_OUTCOME_SIGNAL_KEYS,
    AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE,
  } = mod;

  // -------------------------------------------------------------------------
  // Group 1 — Validation: valid outcome
  // -------------------------------------------------------------------------
  await t.test("Validation: valid outcome", async (t) => {
    await t.test("full valid outcome passes", () => {
      const result = validateAgentRevenueOutcome(makeOutcome());
      assert.equal(result.valid, true);
      assert.deepEqual(result.errors, []);
    });

    await t.test("safety flags are true on valid outcome", () => {
      const outcome = makeOutcome();
      assert.equal(outcome.humanOnTheLoop, true);
      assert.equal(outcome.approvalRequired, true);
      assert.equal(outcome.noExecutionAuthorized, true);
    });

    await t.test("exposes all six cash dimension keys", () => {
      assert.deepEqual([...AGENT_REVENUE_OUTCOME_SIGNAL_KEYS], [
        "customerProof",
        "paymentSignal",
        "painClarity",
        "buyerIdentifiability",
        "offerTestability",
        "cashProximity",
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // Group 2 — Validation: identity fields
  // -------------------------------------------------------------------------
  await t.test("Validation: identity fields", async (t) => {
    for (const field of ["outcomeId", "agentId", "ventureId", "taskId"]) {
      await t.test(`empty ${field} -> invalid`, () => {
        const result = validateAgentRevenueOutcome(makeOutcome({ [field]: "" }));
        assert.equal(result.valid, false);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Group 3 — Validation: cash signals (anti-fluff contract)
  // -------------------------------------------------------------------------
  await t.test("Validation: cash signals", async (t) => {
    await t.test("score below 0 -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ painClarity: makeSignal({ score: -1 }) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("score above 100 -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ painClarity: makeSignal({ score: 101 }) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("non-integer score -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ painClarity: makeSignal({ score: 50.5 }) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("empty basis -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ painClarity: makeSignal({ basis: "   " }) }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("strong score with no evidence -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          painClarity: makeSignal({
            score: AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE,
            evidence: [],
          }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("low score with no evidence -> valid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          painClarity: makeSignal({
            score: AGENT_REVENUE_OUTCOME_EVIDENCE_REQUIRED_SCORE - 1,
            evidence: [],
          }),
        }),
      );
      assert.equal(result.valid, true);
    });
  });

  // -------------------------------------------------------------------------
  // Group 4 — Validation: cashGenerated is never invented
  // -------------------------------------------------------------------------
  await t.test("Validation: cashGenerated", async (t) => {
    await t.test("negative amountCents -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ cashGenerated: { amountCents: -1, verified: false, evidence: [] } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("positive amount with no evidence -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: { amountCents: 5000, verified: true, evidence: [] },
          paymentSignal: makeSignal({ score: 80 }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("positive cash with zero payment signal -> invalid (incoherent)", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: { amountCents: 5000, verified: true, evidence: [makeFinancialEvidence()] },
          paymentSignal: makeSignal({ score: 0, basis: "none yet", evidence: [] }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("positive cash, backed by verified financial evidence and a payment signal -> valid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: { amountCents: 5000, verified: true, evidence: [makeFinancialEvidence()] },
          paymentSignal: makeSignal({ score: 90 }),
          cashProximity: makeSignal({ score: 95 }),
        }),
      );
      assert.equal(result.valid, true);
    });

    await t.test("positive cash with verified signed_loi -> valid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: {
            amountCents: 5000,
            verified: true,
            evidence: [makeFinancialEvidence({ kind: "signed_loi", referenceId: "loi-001", summary: "Signed letter of intent for paid pilot" })],
          },
          paymentSignal: makeSignal({ score: 90 }),
        }),
      );
      assert.equal(result.valid, true);
    });

    await t.test("positive cash with only self_reported evidence -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: {
            amountCents: 5000,
            verified: true,
            evidence: [makeEvidence({ kind: "self_reported", referenceId: "note-1", summary: "I believe we made a sale" })],
          },
          paymentSignal: makeSignal({ score: 90 }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("positive cash with unverified stripe_charge -> invalid (not verified financial)", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          cashGenerated: {
            amountCents: 5000,
            verified: true,
            evidence: [makeFinancialEvidence({ isVerified: false })],
          },
          paymentSignal: makeSignal({ score: 90 }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("structurally invalid evidence ref (empty referenceId) -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({
          painClarity: makeSignal({ score: 80, evidence: [makeEvidence({ referenceId: "" })] }),
        }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("non-boolean verified -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ cashGenerated: { amountCents: 0, verified: "yes", evidence: [] } }),
      );
      assert.equal(result.valid, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 5 — Validation: narrative, proposal, governance
  // -------------------------------------------------------------------------
  await t.test("Validation: narrative, proposal, governance", async (t) => {
    await t.test("empty evidenceSummary -> invalid", () => {
      const result = validateAgentRevenueOutcome(makeOutcome({ evidenceSummary: "  " }));
      assert.equal(result.valid, false);
    });

    await t.test("empty nextCashAction.actionLabel -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ nextCashAction: { actionLabel: "", rationale: "x" } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("empty nextCashAction.rationale -> invalid", () => {
      const result = validateAgentRevenueOutcome(
        makeOutcome({ nextCashAction: { actionLabel: "x", rationale: "" } }),
      );
      assert.equal(result.valid, false);
    });

    await t.test("invalid createdAt -> invalid", () => {
      const result = validateAgentRevenueOutcome(makeOutcome({ createdAt: "not-a-date" }));
      assert.equal(result.valid, false);
    });

    await t.test("humanOnTheLoop not true -> invalid", () => {
      const result = validateAgentRevenueOutcome(makeOutcome({ humanOnTheLoop: false }));
      assert.equal(result.valid, false);
    });

    await t.test("noExecutionAuthorized not true -> invalid", () => {
      const result = validateAgentRevenueOutcome(makeOutcome({ noExecutionAuthorized: false }));
      assert.equal(result.valid, false);
    });
  });

  // -------------------------------------------------------------------------
  // Group 6 — buildAgentRevenueOutcome
  // -------------------------------------------------------------------------
  await t.test("buildAgentRevenueOutcome", async (t) => {
    await t.test("locks governance flags to true", () => {
      const built = buildAgentRevenueOutcome({
        ...makeOutcome(),
        humanOnTheLoop: undefined,
        approvalRequired: undefined,
        noExecutionAuthorized: undefined,
      });
      assert.equal(built.humanOnTheLoop, true);
      assert.equal(built.approvalRequired, true);
      assert.equal(built.noExecutionAuthorized, true);
    });

    await t.test("output passes validation", () => {
      const built = buildAgentRevenueOutcome(makeOutcome());
      const result = validateAgentRevenueOutcome(built);
      assert.equal(result.valid, true);
    });

    await t.test("deep-copies signal evidence arrays", () => {
      const input = makeOutcome();
      const built = buildAgentRevenueOutcome(input);
      built.customerProof.evidence.push("mutated");
      assert.equal(input.customerProof.evidence.includes("mutated"), false);
    });

    await t.test("deep-copies cashGenerated evidence array", () => {
      const input = makeOutcome();
      const built = buildAgentRevenueOutcome(input);
      built.cashGenerated.evidence.push("mutated");
      assert.equal(input.cashGenerated.evidence.includes("mutated"), false);
    });

    await t.test("adapts legacy string evidence to self_reported unverified", () => {
      const built = buildAgentRevenueOutcome(
        makeOutcome({
          painClarity: makeSignal({ score: 80, evidence: ["legacy free-text note"] }),
        }),
      );
      const ref = built.painClarity.evidence[0];
      assert.equal(ref.kind, "self_reported");
      assert.equal(ref.isVerified, false);
      assert.equal(ref.source, "legacy");
      assert.equal(ref.summary, "legacy free-text note");
    });

    await t.test("legacy-adapted outcome still passes validation", () => {
      const built = buildAgentRevenueOutcome(
        makeOutcome({
          painClarity: makeSignal({ score: 80, evidence: ["legacy free-text note"] }),
        }),
      );
      const result = validateAgentRevenueOutcome(built);
      assert.equal(result.valid, true);
    });

    await t.test("preserves typed EvidenceRef kind through build", () => {
      const built = buildAgentRevenueOutcome(
        makeOutcome({
          paymentSignal: makeSignal({ score: 70, evidence: [makeFinancialEvidence({ kind: "signed_loi", referenceId: "loi-9" })] }),
        }),
      );
      assert.equal(built.paymentSignal.evidence[0].kind, "signed_loi");
      assert.equal(built.paymentSignal.evidence[0].referenceId, "loi-9");
    });
  });
});
