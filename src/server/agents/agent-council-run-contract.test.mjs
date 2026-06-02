#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const contractPath = path.join(__dirname, "agent-council-run-contract.ts");

test("Agent Council Run Contract tests", async (t) => {
  const { createJiti } = await import("jiti");
  const jiti = createJiti(import.meta.url, {
    alias: {
      "@": path.join(projectRoot, "src"),
      "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
    },
  });

  const mod = await jiti.import(contractPath);
  const {
    AGENT_COUNCIL_ROLE_IDS,
    AGENT_COUNCIL_ROLES,
    AGENT_COUNCIL_ORCHESTRATOR_ID,
    buildAgentCouncilRun,
    buildAgentCouncilTurn,
    buildAgentCouncilVerdict,
    validateAgentCouncilRun,
    appendAgentCouncilTurn,
    deriveCouncilDecision,
    mapCouncilVerdictToNextActionMandateInput,
    mapCouncilVerdictToMoneyStrategyInput,
    councilRunRequiresCeoApproval,
    gravityRolePrioritizesRoiEvidenceSpeedAndRisk,
  } = mod;

  const mandateContract = await jiti.import(path.join(__dirname, "next-action-mandate-contract.ts"));
  const routingContract = await jiti.import(path.join(__dirname, "money-strategy-routing-graph-contract.ts"));
  const { buildNextActionMandate, validateNextActionMandate } = mandateContract;
  const { routeMoneyStrategy } = routingContract;

  function baseRunInput(overrides = {}) {
    return {
      runId: "council_run_001",
      objective: "Decide the next cash move for venture alpha",
      sourceType: "cash_action_packet",
      sourceId: "packet_001",
      ventureId: "venture_001",
      rolesRequested: ["joris_orchestrator", "t_gravity", "auditor"],
      ...overrides,
    };
  }

  function completedTurn(overrides = {}) {
    return buildAgentCouncilTurn({
      turnId: overrides.turnId ?? `turn_${overrides.roleId ?? "t_gravity"}`,
      runId: "council_run_001",
      roleId: overrides.roleId ?? "t_gravity",
      inputSummary: "Evaluate ROI and evidence",
      outputSummary: overrides.outputSummary ?? "Proceed with paid pilot validation",
      recommendation: overrides.recommendation ?? "proceed",
      confidenceScore: overrides.confidenceScore ?? 72,
      riskFlags: overrides.riskFlags ?? [],
      evidenceRefs: overrides.evidenceRefs ?? [],
      status: overrides.status ?? "completed",
      createdAt: overrides.createdAt ?? "2026-06-02T12:00:00.000Z",
      ...overrides,
    });
  }

  await t.test("builds a valid council run", () => {
    const run = buildAgentCouncilRun(baseRunInput());
    const result = validateAgentCouncilRun(run);

    assert.equal(result.valid, true);
    assert.equal(run.orchestratorAgentId, AGENT_COUNCIL_ORCHESTRATOR_ID);
    assert.equal(run.humanOnTheLoop, true);
    assert.equal(run.noExecutionAuthorized, true);
    assert.equal(run.status, "draft");
  });

  await t.test("all canonical roles exist", () => {
    assert.equal(AGENT_COUNCIL_ROLE_IDS.length, 9);
    for (const roleId of AGENT_COUNCIL_ROLE_IDS) {
      assert.ok(AGENT_COUNCIL_ROLES[roleId], `missing role definition for ${roleId}`);
      assert.equal(AGENT_COUNCIL_ROLES[roleId].roleId, roleId);
    }
  });

  await t.test("no role authorizes execution", () => {
    for (const roleId of AGENT_COUNCIL_ROLE_IDS) {
      const role = AGENT_COUNCIL_ROLES[roleId];
      assert.equal(role.noExecutionAuthorized, true);
      assert.ok(
        role.forbiddenActions.some((action) => action.includes("runtime_dispatch")),
        `${roleId} must forbid runtime dispatch`,
      );
      assert.ok(
        role.forbiddenActions.some((action) => action.includes("external_execution")),
        `${roleId} must forbid external execution`,
      );
    }
  });

  await t.test("t_gravity prioritizes ROI, evidence, speed-to-cash, and risk", () => {
    assert.equal(gravityRolePrioritizesRoiEvidenceSpeedAndRisk(), true);
    const gravity = AGENT_COUNCIL_ROLES.t_gravity;
    assert.match(gravity.mission.toLowerCase(), /roi/);
    assert.match(gravity.mission.toLowerCase(), /evidence/);
    assert.match(gravity.mission.toLowerCase(), /speed-to-cash/);
    assert.match(gravity.mission.toLowerCase(), /risk/);
  });

  await t.test("hermes, scribe, closer, and operator cannot send or dispatch", () => {
    const hermes = AGENT_COUNCIL_ROLES.hermes;
    assert.ok(hermes.forbiddenActions.some((a) => a.includes("send")));
    assert.ok(hermes.forbiddenActions.some((a) => a.includes("contact_customer")));

    const scribe = AGENT_COUNCIL_ROLES.scribe;
    assert.ok(scribe.forbiddenActions.some((a) => a.includes("send")));
    assert.ok(scribe.forbiddenActions.some((a) => a.includes("publish")));

    const closer = AGENT_COUNCIL_ROLES.closer;
    assert.ok(closer.forbiddenActions.some((a) => a.includes("contact_customer")));

    const operator = AGENT_COUNCIL_ROLES.operator;
    assert.ok(operator.forbiddenActions.some((a) => a.includes("runtime_dispatch")));
  });

  await t.test("auditor veto forces CEO decision", () => {
    const turns = [
      completedTurn({ roleId: "t_gravity", recommendation: "proceed" }),
      completedTurn({
        roleId: "auditor",
        turnId: "turn_auditor",
        recommendation: "veto",
        riskFlags: ["auditor_veto"],
      }),
    ];

    assert.equal(deriveCouncilDecision(turns), "needs_ceo_decision");
  });

  await t.test("kill_candidate is recommendation only", () => {
    const turns = [
      completedTurn({ roleId: "t_gravity", recommendation: "kill_candidate" }),
    ];

    const decision = deriveCouncilDecision(turns);
    assert.equal(decision, "kill_candidate");

    const verdict = buildAgentCouncilVerdict({
      verdictId: "verdict_001",
      runId: "council_run_001",
      recommendedAction: "Pause venture and reallocate compute",
      turns,
      decision,
    });

    assert.equal(verdict.noExecutionAuthorized, true);
    assert.ok(verdict.riskFlags.includes("kill_candidate_recommendation_only"));
  });

  await t.test("append turn is deterministic", () => {
    const run = buildAgentCouncilRun(baseRunInput());
    const turnA = completedTurn({
      turnId: "turn_b",
      createdAt: "2026-06-02T12:10:00.000Z",
    });
    const turnB = completedTurn({
      turnId: "turn_a",
      roleId: "auditor",
      recommendation: "support",
      createdAt: "2026-06-02T12:05:00.000Z",
    });

    const first = appendAgentCouncilTurn(appendAgentCouncilTurn(run, turnA), turnB);
    const second = appendAgentCouncilTurn(appendAgentCouncilTurn(run, turnB), turnA);

    assert.deepEqual(
      first.turns.map((turn) => turn.turnId),
      second.turns.map((turn) => turn.turnId),
    );
  });

  await t.test("failed turn can be retried by policy", () => {
    const run = buildAgentCouncilRun(
      baseRunInput({
        retryPolicy: { maxRetriesPerRole: 2, retryFailedTurns: true },
      }),
    );

    const failed = completedTurn({
      turnId: "turn_failed",
      status: "failed",
      recommendation: "refine",
    });
    const retry = completedTurn({
      turnId: "turn_retry",
      status: "completed",
      recommendation: "proceed",
      createdAt: "2026-06-02T12:15:00.000Z",
    });

    const afterFailed = appendAgentCouncilTurn(run, failed);
    const afterRetry = appendAgentCouncilTurn(afterFailed, retry);

    const gravityTurns = afterRetry.turns.filter((turn) => turn.roleId === "t_gravity");
    assert.equal(gravityTurns.length, 2);
    assert.equal(gravityTurns[1].retryCount, 1);
  });

  await t.test("verdict maps to NextActionMandate input without duplicating mandate model", () => {
    const verdict = buildAgentCouncilVerdict({
      verdictId: "verdict_002",
      runId: "council_run_001",
      recommendedAction: "Run a paid pilot with two warm buyers",
      turns: [completedTurn({ recommendation: "proceed" })],
      decision: "proceed",
    });

    const mandateInput = mapCouncilVerdictToNextActionMandateInput(verdict, {
      mandateId: "mandate_from_council_001",
      previousActionId: "packet_001",
      ventureId: "venture_001",
      createdAt: "2026-06-02T13:00:00.000Z",
    });

    assert.equal(typeof mandateInput.mandateId, "string");
    assert.equal(typeof mandateInput.recommendedAction, "string");
    assert.ok(Array.isArray(mandateInput.requiredEvidence));
    assert.equal("mandateType" in mandateInput, true);
    assert.equal("status" in mandateInput, true);
    assert.equal("humanOnTheLoop" in mandateInput, false);

    const mandate = buildNextActionMandate(mandateInput);
    const validation = validateNextActionMandate(mandate);
    assert.equal(validation.valid, true);
    assert.equal(mandate.noExecutionAuthorized, true);
  });

  await t.test("verdict maps to MoneyStrategy input without duplicating routing graph", () => {
    const turns = [
      completedTurn({
        recommendation: "proceed",
        evidenceRefs: [
          {
            kind: "stripe_charge",
            referenceId: "ch_123",
            summary: "Verified pilot payment",
            isVerified: true,
          },
        ],
      }),
    ];

    const verdict = buildAgentCouncilVerdict({
      verdictId: "verdict_003",
      runId: "council_run_001",
      recommendedAction: "Scale the validated offer",
      turns,
      decision: "proceed",
    });

    const moneyInput = mapCouncilVerdictToMoneyStrategyInput(verdict, {
      mandateId: "mandate_from_council_002",
      previousActionId: "packet_001",
      ventureId: "venture_001",
      turns,
      createdAt: "2026-06-02T13:30:00.000Z",
    });

    assert.ok(moneyInput.mandateBuildInput);
    assert.ok(moneyInput.routing);
    assert.equal(typeof moneyInput.routing.currentState, "string");
    assert.equal(typeof moneyInput.routing.evidenceQuality, "string");
    assert.equal("routeId" in moneyInput, false);
    assert.equal("mandate" in moneyInput, false);

    const mandate = buildNextActionMandate(moneyInput.mandateBuildInput);
    const decision = routeMoneyStrategy({
      mandate,
      currentState: moneyInput.routing.currentState,
      evidenceQuality: moneyInput.routing.evidenceQuality,
      createdAt: moneyInput.routing.createdAt,
    });

    assert.equal(decision.noExecutionAuthorized, true);
  });

  await t.test("contract source has no Temporal, DB, API, or runtime imports", () => {
    const source = fs.readFileSync(contractPath, "utf8");
    assert.doesNotMatch(source, /@temporalio/);
    assert.doesNotMatch(source, /from\s+["'].*supabase/i);
    assert.doesNotMatch(source, /from\s+["'].*\/api\//i);
    assert.doesNotMatch(source, /from\s+["'].*\/runtime\//i);
  });

  await t.test("governance invariants remain pinned", () => {
    const run = buildAgentCouncilRun(baseRunInput());
    const verdict = buildAgentCouncilVerdict({
      verdictId: "verdict_004",
      runId: run.runId,
      recommendedAction: "Collect stronger buyer proof",
      turns: [],
      decision: "refine",
    });

    assert.equal(run.humanOnTheLoop, true);
    assert.equal(run.noExecutionAuthorized, true);
    assert.equal(verdict.approvalRequired, true);
    assert.equal(verdict.noExecutionAuthorized, true);
    assert.equal(councilRunRequiresCeoApproval(verdict), false);
    assert.equal(
      councilRunRequiresCeoApproval({
        ...verdict,
        decision: "needs_ceo_decision",
      }),
      true,
    );
  });
});
