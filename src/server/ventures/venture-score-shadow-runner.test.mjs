#!/usr/bin/env node

// src/server/ventures/venture-score-shadow-runner.test.mjs
//
// V7 Phase 1 step 3 — shadow mode.
//
// Every dependency is injected, so nothing here calls an LLM, touches Supabase,
// or reaches the network. What is exercised is the behaviour that matters:
//
//   * the shadow log mirrors, it never acts — no lifecycle call, ever;
//   * one failed dimension degrades that dimension, not the whole pass;
//   * one failed venture does not stop the pass over the others;
//   * an unmeasured dimension is scored at its WORST case, never flattered;
//   * ledger metadata stays inside the ledger's own constraints.

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");

const { createJiti } = await import("jiti");
const jiti = createJiti(import.meta.url, {
  alias: {
    "@": path.join(projectRoot, "src"),
    "server-only": path.join(projectRoot, "src/scripts/smoke/server-only-stub.mjs"),
  },
});

const {
  SHADOW_OUTCOME_ACTION_TYPE,
  SHADOW_PROPOSAL_ACTION_TYPE,
  buildProposalLedgerMetadata,
  buildShadowSystemPrompt,
  buildShadowUserPrompt,
  parseShadowEvidence,
  recordShadowOutcome,
  runShadowProposalForVenture,
  runShadowScorePass,
  unresolvedValueFor,
} = await jiti.import(path.join(__dirname, "venture-score-shadow-runner.ts"));

const { SCORE_DIMENSIONS, buildVentureScore } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-scoring.ts"),
);
const { buildVentureScoreProposal } = await jiti.import(
  path.join(projectRoot, "src/features/ventures/venture-score-proposal.ts"),
);
const { validateLedgerEventPayload } = await jiti.import(
  path.join(projectRoot, "src/server/actions/ledger-events.ts"),
);

const DIMENSIONS = SCORE_DIMENSIONS.map((d) => d.key);
const NOW = "2026-08-05T12:00:00.000Z";

const ctx = { workspace: { id: "workspace_test" }, userId: "owner_1", storagePreference: "local" };

function venture(overrides = {}) {
  return {
    id: "venture_1",
    name: "Test venture",
    description: "A description",
    targetCustomer: "Operators",
    problem: "A problem",
    offer: "An offer",
    primaryChannel: "email",
    status: "candidate",
    decisions: [],
    ...overrides,
  };
}

/** A complete, well-sourced model reply. */
function modelReply(overrides = {}) {
  return {
    evidence: DIMENSIONS.map((dimension, index) => ({
      dimension,
      value: 7,
      rationale: `Because of ${dimension}.`,
      source:
        index < 3
          ? { kind: "external", url: `https://example.com/s-${index}` }
          : { kind: "internal", ref: `venture:${dimension}` },
      ...(overrides[dimension] ?? {}),
    })),
  };
}

function generatorReturning(json, extra = {}) {
  return async () => ({ ok: true, json, rawText: "", modelId: "test-model", ...extra });
}

/** Captures ledger events instead of writing them. */
function recorder(events) {
  return async (_ctx, event) => {
    events.push(event);
    return {};
  };
}

test("Shadow runner — prompt construction (V7 Phase 1 step 3)", async (t) => {
  await t.test("the system prompt names every dimension and its polarity", () => {
    const prompt = buildShadowSystemPrompt();

    for (const dimension of SCORE_DIMENSIONS) {
      assert.ok(prompt.includes(dimension.key), `${dimension.key} must be named`);
    }
    assert.match(prompt, /higher is WORSE/, "inverted dimensions must be flagged");
  });

  await t.test("the system prompt asks for an honest gap over a fabricated source", () => {
    // A made-up url poisons the whole set: the operator checks sources, and one
    // invention discredits the ten scores beside it.
    assert.match(buildShadowSystemPrompt(), /fabricated url is worse than an admitted gap/i);
  });

  await t.test("the user prompt omits empty venture fields", () => {
    const prompt = buildShadowUserPrompt(venture({ problem: "", offer: "   " }));

    assert.match(prompt, /Name: Test venture/);
    assert.ok(!prompt.includes("Problem:"), "an empty field must not be sent as a blank line");
    assert.ok(!prompt.includes("Offer:"));
  });
});

test("Shadow runner — graceful degradation (V7 Phase 1 step 3)", async (t) => {
  await t.test("a complete reply resolves every dimension", () => {
    const parsed = parseShadowEvidence(modelReply());

    assert.equal(parsed.evidence.length, 11);
    assert.deepEqual(parsed.unresolved, []);
  });

  await t.test("one bad dimension degrades that dimension only", () => {
    const parsed = parseShadowEvidence(
      modelReply({ risk: { value: "not a number" } }),
    );

    assert.equal(parsed.evidence.length, 11, "the set stays complete");
    assert.deepEqual(parsed.unresolved, ["risk"]);
    const other = parsed.evidence.find((e) => e.dimension === "revenuePotential");
    assert.equal(other.value, 7, "the other dimensions are untouched");
  });

  await t.test("an unmeasured dimension takes its WORST value, never a flattering one", () => {
    // A midpoint would assert a finding nobody made, and on an inverted
    // dimension a low value would read as "low risk" exactly where evidence
    // is missing.
    for (const dimension of SCORE_DIMENSIONS) {
      const expected = dimension.polarity === "negative" ? 10 : 0;
      assert.equal(unresolvedValueFor(dimension), expected, dimension.key);
    }

    const parsed = parseShadowEvidence({ evidence: [] });
    const risk = parsed.evidence.find((e) => e.dimension === "risk");
    assert.equal(risk.value, 10, "unmeasured risk is assumed maximal");
  });

  await t.test("a fabricated or non-http source is treated as no evidence", () => {
    const parsed = parseShadowEvidence(
      modelReply({
        revenuePotential: { source: { kind: "external", url: "not-a-url" } },
        marketPain: { source: { kind: "external", url: "file:///etc/passwd" } },
      }),
    );

    assert.ok(parsed.unresolved.includes("revenuePotential"));
    assert.ok(parsed.unresolved.includes("marketPain"));
  });

  await t.test("a missing rationale is unresolved, not silently accepted", () => {
    const parsed = parseShadowEvidence(modelReply({ differentiation: { rationale: "  " } }));
    assert.deepEqual(parsed.unresolved, ["differentiation"]);
  });

  await t.test("a duplicated dimension keeps the first and stays complete", () => {
    const reply = modelReply();
    reply.evidence.push({ ...reply.evidence[0], value: 1 });

    const parsed = parseShadowEvidence(reply);
    assert.equal(parsed.evidence.length, 11);
    assert.equal(parsed.evidence[0].value, 7, "the first answer wins");
  });

  await t.test("a shapeless reply still yields a complete, fully unresolved set", () => {
    for (const junk of [null, {}, { evidence: "nope" }, { evidence: [null, 42] }]) {
      const parsed = parseShadowEvidence(junk);
      assert.equal(parsed.evidence.length, 11, JSON.stringify(junk));
      assert.equal(parsed.unresolved.length, 11);
    }
  });

  await t.test("an unresolved set still builds a proposal, and its gates refuse it", () => {
    const parsed = parseShadowEvidence({ evidence: [] });
    const built = buildVentureScoreProposal({
      proposalId: "prop_test",
      ventureId: "v1",
      workspaceId: "w1",
      proposedBy: "agent",
      proposedAt: NOW,
      evidence: parsed.evidence,
    });

    assert.equal(built.status, "built", "an incomplete answer still produces a comparable proposal");
    assert.equal(built.proposal.gates.allPassed, false, "but no gate may pass without evidence");
  });
});

test("Shadow runner — the log mirrors, never acts (V7 Phase 1 step 3)", async (t) => {
  await t.test("a proposal writes one decision event and nothing else", async () => {
    const events = [];
    const outcome = await runShadowProposalForVenture(ctx, venture(), {
      generateJson: generatorReturning(modelReply()),
      recordEvent: recorder(events),
      now: () => NOW,
    });

    assert.equal(outcome.status, "proposed");
    assert.equal(events.length, 1);
    assert.equal(events[0].actionType, SHADOW_PROPOSAL_ACTION_TYPE);
    assert.equal(events[0].eventType, "decision");
    assert.equal(events[0].requiresConfirmation, false);
    assert.equal(events[0].autonomyLevel, 1, "A1 — proposes, executes nothing");
  });

  await t.test("the module neither imports nor calls a lifecycle mutator", async () => {
    // The structural guarantee: a proposal cannot move a venture. Checked
    // against code, not prose — the header comment names these functions to
    // say they are absent, so a whole-file substring search would flag itself.
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(__dirname, "venture-score-shadow-runner.ts"), "utf8"),
    );
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const mutator of [
      "scoreVenture",
      "promoteVenture",
      "archiveVenture",
      "killVenture",
      "updateVenture",
      "createVenture",
    ]) {
      assert.ok(
        !new RegExp(`\\b${mutator}\\s*\\(`).test(code),
        `${mutator} must never be called by the shadow runner`,
      );
      assert.ok(
        !new RegExp(`\\b${mutator}\\b[^\\n]*from\\s`).test(code),
        `${mutator} must not be imported by the shadow runner`,
      );
    }

    // The lifecycle service as a whole is off-limits, however it is named.
    assert.ok(
      !/from\s+["'][^"']*venture-lifecycle-service["']/.test(code),
      "the lifecycle service must not be imported at all",
    );
  });

  await t.test("the emitted ledger effect declares a plan, not a state change", async () => {
    // Asserted on the EMITTED event, not on a locally built metadata object:
    // checking metadata alone would still pass if `operation` changed from
    // "plan" to something that mutates state.
    const events = [];
    await runShadowProposalForVenture(ctx, venture(), {
      generateJson: generatorReturning(modelReply()),
      recordEvent: recorder(events),
      now: () => NOW,
    });

    assert.deepEqual(events[0].effect, {
      kind: "db_write",
      operation: "plan",
      target: "venture_score_proposal",
    });
  });

  await t.test("the emitted metadata carries the proposal identity", () => {
    const parsed = parseShadowEvidence(modelReply());
    const built = buildVentureScoreProposal({
      proposalId: "prop_test",
      ventureId: "v1",
      workspaceId: ctx.workspace.id,
      proposedBy: "agent",
      proposedAt: NOW,
      evidence: parsed.evidence,
    });

    const metadata = buildProposalLedgerMetadata(built.proposal, []);
    assert.equal(metadata.ventureId, "v1");
    assert.equal(metadata.gatesPassed, true);
  });

  await t.test("the emitted event satisfies the ledger's own validation", () => {
    const events = [];
    return runShadowProposalForVenture(ctx, venture(), {
      generateJson: generatorReturning(modelReply()),
      recordEvent: recorder(events),
      now: () => NOW,
    }).then(() => {
      // The ledger rejects reserved metadata keys outright rather than trimming
      // them, so a bad key name would drop the whole shadow record.
      assert.doesNotThrow(() => validateLedgerEventPayload(events[0]));
    });
  });

  await t.test("model-authored text is bounded before it reaches the ledger", () => {
    const long = "x".repeat(5000);
    const parsed = parseShadowEvidence(modelReply({ risk: { rationale: long } }));
    const built = buildVentureScoreProposal({
      proposalId: "prop_test",
      ventureId: "v1",
      workspaceId: "w1",
      proposedBy: "agent",
      proposedAt: NOW,
      evidence: parsed.evidence,
    });

    const metadata = buildProposalLedgerMetadata(built.proposal, []);
    for (const row of metadata.dimensions) {
      assert.ok(row.rationale.length <= 240, "an unbounded reply must not grow a ledger row");
    }
  });
});

test("Shadow runner — failure isolation (V7 Phase 1 step 3)", async (t) => {
  await t.test("a failed generation skips that venture without throwing", async () => {
    const events = [];
    const outcome = await runShadowProposalForVenture(ctx, venture(), {
      generateJson: async () => ({ ok: false, errorCode: "all_providers_failed", fallbackReason: "no key" }),
      recordEvent: recorder(events),
    });

    assert.equal(outcome.status, "skipped");
    assert.match(outcome.reason, /no key/);
    assert.equal(events.length, 0, "nothing is logged for a proposal that never existed");
  });

  await t.test("a throwing generator skips rather than escaping", async () => {
    const outcome = await runShadowProposalForVenture(ctx, venture(), {
      generateJson: async () => {
        throw new Error("boom");
      },
    });

    assert.equal(outcome.status, "skipped");
  });

  await t.test("a failed ledger write skips without losing the pass", async () => {
    const outcome = await runShadowProposalForVenture(ctx, venture(), {
      generateJson: generatorReturning(modelReply()),
      recordEvent: async () => {
        throw new Error("ledger down");
      },
      now: () => NOW,
    });

    assert.equal(outcome.status, "skipped");
    assert.match(outcome.reason, /shadow log write failed/);
  });

  await t.test("one bad venture does not stop the pass over the others", async () => {
    let call = 0;
    const events = [];
    const result = await runShadowScorePass(ctx, {
      listVentures: async () => [
        venture({ id: "v1" }),
        venture({ id: "v2" }),
        venture({ id: "v3" }),
      ],
      generateJson: async () => {
        call += 1;
        if (call === 2) throw new Error("transient");
        return { ok: true, json: modelReply(), rawText: "", modelId: "m" };
      },
      recordEvent: recorder(events),
      now: () => NOW,
    });

    assert.equal(result.considered, 3);
    assert.equal(result.proposed.filter((p) => p.status === "proposed").length, 2);
    assert.equal(result.proposed.filter((p) => p.status === "skipped").length, 1);
  });

  await t.test("only candidate ventures are scored", async () => {
    // Past `candidate` the owner has already ruled — there is no decision left
    // for a proposal to be compared against.
    const result = await runShadowScorePass(ctx, {
      listVentures: async () => [
        venture({ id: "v1", status: "candidate" }),
        venture({ id: "v2", status: "scored" }),
        venture({ id: "v3", status: "killed" }),
        venture({ id: "v4", status: "operating" }),
      ],
      generateJson: generatorReturning(modelReply()),
      recordEvent: recorder([]),
      now: () => NOW,
    });

    assert.equal(result.considered, 1);
  });

  await t.test("an unreadable venture list yields an empty pass, not a throw", async () => {
    const result = await runShadowScorePass(ctx, {
      listVentures: async () => {
        throw new Error("db down");
      },
    });

    assert.equal(result.considered, 0);
    assert.deepEqual(result.proposed, []);
  });
});

test("Shadow runner — divergence outcome (V7 Phase 1 step 3)", async (t) => {
  function proposalAt(value) {
    const parsed = parseShadowEvidence(
      modelReply(Object.fromEntries(DIMENSIONS.map((d) => [d, { value }]))),
    );
    return buildVentureScoreProposal({
      proposalId: "prop_test",
      ventureId: "v1",
      workspaceId: ctx.workspace.id,
      proposedBy: "inventor",
      proposedAt: NOW,
      evidence: parsed.evidence,
    }).proposal;
  }

  const actualAt = (value) =>
    buildVentureScore(Object.fromEntries(DIMENSIONS.map((d) => [d, value])));

  await t.test("the owner's decision is logged as a learning event", async () => {
    const events = [];
    const ok = await recordShadowOutcome(ctx, proposalAt(7), actualAt(7), {
      recordEvent: recorder(events),
    });

    assert.equal(ok, true);
    assert.equal(events[0].actionType, SHADOW_OUTCOME_ACTION_TYPE);
    assert.equal(events[0].eventType, "learning");
    assert.equal(events[0].metadata.recommendationAgreed, true);
    assert.equal(events[0].metadata.meanAbsoluteDelta, 0);
  });

  await t.test("disagreements are recorded per dimension", async () => {
    const events = [];
    await recordShadowOutcome(ctx, proposalAt(9), actualAt(4), {
      recordEvent: recorder(events),
    });

    assert.equal(events[0].metadata.disagreements.length, 11);
    assert.equal(events[0].metadata.proposedOverall > events[0].metadata.actualOverall, true);
  });

  await t.test("a failed outcome write returns false rather than disturbing the owner", async () => {
    // The owner has just scored a venture; an audit write failing must not
    // surface as an error on their action.
    const ok = await recordShadowOutcome(ctx, proposalAt(7), actualAt(7), {
      recordEvent: async () => {
        throw new Error("ledger down");
      },
    });

    assert.equal(ok, false);
  });

  await t.test("the outcome event satisfies the ledger's validation", async () => {
    const events = [];
    await recordShadowOutcome(ctx, proposalAt(8), actualAt(5), {
      recordEvent: recorder(events),
    });

    assert.doesNotThrow(() => validateLedgerEventPayload(events[0]));
  });
});
