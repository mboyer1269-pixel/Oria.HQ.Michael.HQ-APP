#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const composerPath = path.join(__dirname, "venture-council-cash-run-composer.ts");
const councilContractPath = path.join(
  projectRoot,
  "src/server/agents/agent-council-run-contract.ts",
);

test("Venture Council Cash Run Composer", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const composerMod = await jiti.import(composerPath);
  const packetMod = await jiti.import(path.join(__dirname, "cash-action-packet.ts"));
  const councilMod = await jiti.import(councilContractPath);
  const mandateMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/next-action-mandate-contract.ts"),
  );
  const routingMod = await jiti.import(
    path.join(projectRoot, "src/server/agents/money-strategy-routing-graph-contract.ts"),
  );

  const { composeVentureCouncilCashRun } = composerMod;
  const { buildCashActionPacket } = packetMod;
  const {
    buildAgentCouncilRun,
    appendAgentCouncilTurn,
    buildAgentCouncilVerdict,
    deriveCouncilDecision,
    mapCouncilVerdictToNextActionMandateInput,
    mapCouncilVerdictToMoneyStrategyInput,
  } = councilMod;
  const { buildNextActionMandate, validateNextActionMandate } = mandateMod;
  const { routeMoneyStrategy } = routingMod;

  function validPacket(overrides = {}) {
    return buildCashActionPacket({
      packetId: "packet_council_001",
      ventureId: "venture_001",
      agentId: "agent_research",
      targetBuyer: "RevOps leads at 20-100 person B2B SaaS companies",
      buyerType: "smb",
      painHypothesis:
        "They reconcile pipeline by hand every Friday and lose hours to it.",
      offer: "Done-for-you weekly pipeline reconciliation delivered every Friday.",
      pricePointCents: 49_000,
      callToAction: "Reply pilot to start a paid 2-week pilot this Friday.",
      outreachDraft:
        "Hi — saw your team reconciles pipeline manually. Want a done-for-you Friday report?",
      expectedCashSignal: "signed_loi",
      requiredEvidence: ["signed_loi"],
      expectedCashImpactCents: 49_000,
      expectedCostCents: 7_000,
      createdAt: "2026-06-02T12:00:00.000Z",
      ...overrides,
    });
  }

  function compose(overrides = {}, inputOverrides = {}) {
    return composeVentureCouncilCashRun({
      runId: "council_cash_run_001",
      cashActionPacket: validPacket(overrides),
      createdAt: "2026-06-02T12:00:00.000Z",
      ...inputOverrides,
    });
  }

  await t.test("composes council run from a valid CashActionPacket", () => {
    const result = compose();

    assert.equal(result.run.sourceType, "cash_action_packet");
    assert.equal(result.run.sourceId, "packet_council_001");
    assert.equal(result.run.orchestratorAgentId, "joris");
    assert.equal(result.turns.length, 5);
    assert.ok(result.verdict.verdictId);
    assert.ok(result.nextActionMandateInput);
    assert.ok(result.moneyStrategyInput);
  });

  await t.test("includes Orient, T-Gravity, Hermès, Auditor, Operator turns", () => {
    const result = compose();
    const roleIds = result.turns.map((turn) => turn.roleId);

    assert.deepEqual(roleIds, ["orient", "t_gravity", "hermes", "auditor", "operator"]);
  });

  await t.test("uses existing council contract helpers", () => {
    assert.equal(typeof buildAgentCouncilRun, "function");
    assert.equal(typeof appendAgentCouncilTurn, "function");
    assert.equal(typeof buildAgentCouncilVerdict, "function");
    assert.equal(typeof deriveCouncilDecision, "function");
    assert.equal(typeof mapCouncilVerdictToNextActionMandateInput, "function");
    assert.equal(typeof mapCouncilVerdictToMoneyStrategyInput, "function");

    const result = compose();
    assert.equal(result.verdict.decision, deriveCouncilDecision(result.turns));
    assert.deepEqual(
      result.nextActionMandateInput,
      result.verdict.nextMandateInput,
    );
    assert.deepEqual(result.moneyStrategyInput, result.verdict.moneyStrategyInput);
  });

  await t.test("does not duplicate council decision logic in composer source", () => {
    const source = fs.readFileSync(composerPath, "utf8");
    assert.doesNotMatch(source, /function\s+deriveCouncilDecision\b/);
    assert.doesNotMatch(source, /function\s+mapCouncilVerdictToNextActionMandateInput\b/);
    assert.doesNotMatch(source, /function\s+mapCouncilVerdictToMoneyStrategyInput\b/);
    assert.doesNotMatch(source, /export\s+const\s+AGENT_COUNCIL_ROLES\b/);
  });

  await t.test("weak evidence leads to needs_more_evidence", () => {
    const result = compose({
      expectedCashSignal: "manual_note",
      requiredEvidence: ["manual_note"],
      expectedCashImpactCents: 10_000,
      expectedCostCents: 5_000,
    });

    assert.equal(result.readiness, "needs_more_evidence");
    const gravity = result.turns.find((turn) => turn.roleId === "t_gravity");
    assert.equal(gravity.recommendation, "refine");
  });

  await t.test("high risk external execution leads to blocked_by_auditor", () => {
    const result = compose({
      outreachDraft: "Please send now automatically to every lead in the CRM.",
    });

    assert.equal(result.readiness, "blocked_by_auditor");
    assert.equal(result.verdict.decision, "needs_ceo_decision");
    const auditor = result.turns.find((turn) => turn.roleId === "auditor");
    assert.equal(auditor.recommendation, "veto");
    assert.ok(auditor.riskFlags.includes("auditor_veto"));
  });

  await t.test("valid packet leads to ready_for_ceo", () => {
    const result = compose();
    assert.equal(result.readiness, "ready_for_ceo");
    assert.equal(result.verdict.decision, "proceed");
  });

  await t.test("Hermès prepares outreach but never sends", () => {
    const result = compose();
    const hermes = result.turns.find((turn) => turn.roleId === "hermes");

    assert.match(hermes.outputSummary.toLowerCase(), /prepare/);
    assert.match(hermes.outputSummary.toLowerCase(), /no send/);
    assert.doesNotMatch(hermes.outputSummary.toLowerCase(), /\bsent\b/);
    assert.doesNotMatch(hermes.outputSummary.toLowerCase(), /\bauto[\s-]?send\b/);
  });

  await t.test("Auditor blocks fake cash language", () => {
    const result = compose({
      outreachDraft: "We already paid and revenue is confirmed — just scale now.",
      requiredEvidence: ["manual_note"],
      expectedCashSignal: "stripe_charge",
    });

    assert.equal(result.readiness, "blocked_by_auditor");
    const auditor = result.turns.find((turn) => turn.roleId === "auditor");
    assert.ok(auditor.riskFlags.includes("fake_cash_risk"));
  });

  await t.test("kill_candidate remains recommendation only", () => {
    const result = compose({
      expectedCashImpactCents: 1_000,
      expectedCostCents: 5_000,
    });

    const gravity = result.turns.find((turn) => turn.roleId === "t_gravity");
    assert.equal(gravity.recommendation, "kill_candidate");
    assert.ok(result.verdict.riskFlags.includes("kill_candidate_recommendation_only"));
    assert.equal(result.verdict.noExecutionAuthorized, true);
  });

  await t.test("governance locks remain true", () => {
    const result = compose();
    assert.equal(result.humanOnTheLoop, true);
    assert.equal(result.noExecutionAuthorized, true);
    assert.equal(result.run.humanOnTheLoop, true);
    assert.equal(result.run.noExecutionAuthorized, true);
  });

  await t.test("deterministic output with same input", () => {
    const input = {
      runId: "council_cash_run_det",
      cashActionPacket: validPacket(),
      createdAt: "2026-06-02T12:00:00.000Z",
    };

    const first = composeVentureCouncilCashRun(input);
    const second = composeVentureCouncilCashRun(input);

    assert.equal(first.readiness, second.readiness);
    assert.equal(first.verdict.decision, second.verdict.decision);
    assert.deepEqual(
      first.turns.map((turn) => ({
        roleId: turn.roleId,
        recommendation: turn.recommendation,
        riskFlags: turn.riskFlags,
      })),
      second.turns.map((turn) => ({
        roleId: turn.roleId,
        recommendation: turn.recommendation,
        riskFlags: turn.riskFlags,
      })),
    );
  });

  await t.test("mandate and money strategy bridges are consumable", () => {
    const result = compose();
    const mandate = buildNextActionMandate(result.nextActionMandateInput);
    assert.equal(validateNextActionMandate(mandate).valid, true);

    const routing = routeMoneyStrategy({
      mandate,
      currentState: result.moneyStrategyInput.routing.currentState,
      evidenceQuality: result.moneyStrategyInput.routing.evidenceQuality,
      createdAt: result.moneyStrategyInput.routing.createdAt,
    });
    assert.equal(routing.noExecutionAuthorized, true);
  });

  await t.test("imports no DB, API, runtime, Temporal, or package/env", () => {
    const source = fs.readFileSync(composerPath, "utf8");
    assert.doesNotMatch(source, /@temporalio/);
    assert.doesNotMatch(source, /from\s+["'].*supabase/i);
    assert.doesNotMatch(source, /from\s+["'].*\/api\//i);
    assert.doesNotMatch(source, /from\s+["'].*\/runtime\//i);
    assert.doesNotMatch(source, /process\.env/);
  });
});
