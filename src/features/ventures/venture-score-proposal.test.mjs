#!/usr/bin/env node

// src/features/ventures/venture-score-proposal.test.mjs
//
// V7 Phase 1 — pure contract for agent-proposed venture scores (shadow mode).
//
// The load-bearing property: the score and the evidence gates are independent.
// A confident proposal with no sources must fail the gates while still
// producing a score, so the owner sees both "it looks promising" and "nothing
// backs it".

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
  DIVERGENCE_TOLERANCE,
  MIN_DISTINCT_EXTERNAL_SOURCES,
  buildVentureScoreProposal,
  evaluateEvidenceGates,
  measureProposalDivergence,
} = await jiti.import(path.join(__dirname, "venture-score-proposal.ts"));

const { SCORE_DIMENSIONS, buildVentureScore } = await jiti.import(
  path.join(__dirname, "venture-scoring.ts"),
);

const DIMENSIONS = SCORE_DIMENSIONS.map((d) => d.key);

/** Well-formed evidence for all 11 dimensions, sourced enough to clear the gates. */
function fullEvidence(overrides = {}) {
  return DIMENSIONS.map((dimension, index) => ({
    dimension,
    value: overrides.value ?? 7,
    rationale: `Justification pour ${dimension}.`,
    // Spread external sources across the first few dimensions so the distinct
    // external count clears the minimum.
    source:
      index < MIN_DISTINCT_EXTERNAL_SOURCES
        ? { kind: "external", url: `https://example.com/source-${index}` }
        : { kind: "internal", ref: `venture-data:${dimension}` },
    ...(overrides.per?.[dimension] ?? {}),
  }));
}

function baseInput(evidence) {
  return {
    proposalId: "prop_test",
    ventureId: "venture_1",
    workspaceId: "workspace_test",
    proposedBy: "agent_analyst",
    proposedAt: "2026-08-05T08:00:00.000Z",
    evidence,
  };
}

test("Venture score proposal — construction (V7 Phase 1)", async (t) => {
  await t.test("builds a proposal from 11 well-formed dimensions", () => {
    const result = buildVentureScoreProposal(baseInput(fullEvidence()));

    assert.equal(result.status, "built");
    assert.equal(result.proposal.evidence.length, 11);
    assert.equal(result.proposal.ventureId, "venture_1");
  });

  await t.test("derives the score instead of trusting a supplied one", () => {
    const result = buildVentureScoreProposal(baseInput(fullEvidence({ value: 7 })));

    // Same inputs through the existing scorer must give the same output — the
    // proposal reuses venture-scoring.ts rather than reimplementing it.
    const expected = buildVentureScore(
      Object.fromEntries(DIMENSIONS.map((d) => [d, 7])),
    );
    assert.equal(result.proposal.score.overallScore, expected.overallScore);
    assert.equal(result.proposal.score.recommendation, expected.recommendation);
  });

  await t.test("a proposal can never authorize execution", () => {
    const result = buildVentureScoreProposal(baseInput(fullEvidence()));
    assert.equal(result.proposal.authorizesExecution, false);
  });

  await t.test("evidence is normalized into the canonical dimension order", () => {
    const shuffled = [...fullEvidence()].reverse();
    const result = buildVentureScoreProposal(baseInput(shuffled));

    assert.deepEqual(
      result.proposal.evidence.map((item) => item.dimension),
      DIMENSIONS,
    );
  });
});

test("Venture score proposal — rejections (V7 Phase 1)", async (t) => {
  const cases = [
    {
      name: "too few dimensions",
      evidence: fullEvidence().slice(0, 10),
      code: "wrong_dimension_count",
    },
    {
      name: "a duplicated dimension",
      evidence: [...fullEvidence().slice(0, 10), fullEvidence()[0]],
      code: "duplicate_dimension",
    },
    {
      name: "an unknown dimension",
      evidence: [
        ...fullEvidence().slice(0, 10),
        { ...fullEvidence()[10], dimension: "notADimension" },
      ],
      code: "unknown_dimension",
    },
    {
      name: "a value above the scale",
      evidence: fullEvidence({ per: { revenuePotential: { value: 11 } } }),
      code: "invalid_value",
    },
    {
      name: "a negative value",
      evidence: fullEvidence({ per: { risk: { value: -1 } } }),
      code: "invalid_value",
    },
    {
      name: "a non-http external source",
      evidence: fullEvidence({
        per: { revenuePotential: { source: { kind: "external", url: "not-a-url" } } },
      }),
      code: "invalid_source",
    },
    {
      name: "an internal source with a blank ref",
      evidence: fullEvidence({
        per: { risk: { source: { kind: "internal", ref: "   " } } },
      }),
      code: "invalid_source",
    },
  ];

  for (const testCase of cases) {
    await t.test(`rejects ${testCase.name}`, () => {
      const result = buildVentureScoreProposal(baseInput(testCase.evidence));
      assert.equal(result.status, "rejected");
      assert.equal(result.code, testCase.code);
    });
  }

  await t.test("rejects a missing identity", () => {
    const result = buildVentureScoreProposal({
      ...baseInput(fullEvidence()),
      proposedBy: "  ",
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.code, "missing_identity");
  });

  await t.test("rejects a malformed source without throwing", () => {
    // Input arrives as parsed LLM JSON, so a field the type calls a string may
    // be absent at runtime. These must return the documented rejection, not
    // throw past the caller.
    const malformed = [
      { kind: "internal" }, // no ref at all
      { kind: "internal", ref: 42 },
      { kind: "external" }, // no url at all
      { kind: "external", url: 42 },
      { kind: "invented" },
      null,
    ];

    for (const source of malformed) {
      const evidence = fullEvidence({ per: { risk: { source } } });
      const result = buildVentureScoreProposal(baseInput(evidence));
      assert.equal(result.status, "rejected", `source ${JSON.stringify(source)} must be rejected`);
      assert.equal(result.code, "invalid_source");
    }
  });

  await t.test("rejects an unparseable timestamp", () => {
    const result = buildVentureScoreProposal({
      ...baseInput(fullEvidence()),
      proposedAt: "not-a-date",
    });
    assert.equal(result.status, "rejected");
    assert.equal(result.code, "invalid_timestamp");
  });

  await t.test("rejects rather than silently repairing", () => {
    // A partial proposal recorded as complete would corrupt the divergence
    // measurement, so there is no lenient path.
    const result = buildVentureScoreProposal(baseInput(fullEvidence().slice(0, 3)));
    assert.equal(result.status, "rejected");
    assert.equal(result.proposal, undefined);
  });
});

test("Venture score proposal — evidence gates (V7 Phase 1)", async (t) => {
  await t.test("a fully sourced proposal passes every gate", () => {
    const result = evaluateEvidenceGates(fullEvidence());
    assert.equal(result.allPassed, true, JSON.stringify(result.gates, null, 2));
  });

  await t.test("a maximal score with no evidence still fails the gates", () => {
    // The property the module exists for: the score and the gates are
    // independent, so confidence cannot substitute for proof.
    // Maximal means best-case per dimension, which is 0 on the four inverted
    // ("negative" polarity) dimensions — cost, owner involvement, difficulty,
    // risk. Filling every dimension with 10 would score 64, not 100.
    const unsourced = SCORE_DIMENSIONS.map((dimension) => ({
      dimension: dimension.key,
      value: dimension.polarity === "negative" ? 0 : 10,
      rationale: `Justification pour ${dimension.key}.`,
      source: { kind: "none" },
    }));

    const built = buildVentureScoreProposal(baseInput(unsourced));
    assert.equal(built.status, "built", "an unsourced proposal is still well-formed");
    assert.equal(built.proposal.score.overallScore, 100, "the score is maximal");
    assert.equal(built.proposal.score.recommendation, "go");
    assert.equal(built.proposal.gates.allPassed, false, "but no gate is satisfied");
  });

  await t.test("an unsourced critical dimension fails its gate", () => {
    const evidence = fullEvidence({
      per: { revenuePotential: { source: { kind: "none" } } },
    });
    const result = evaluateEvidenceGates(evidence);

    const gate = result.gates.find((g) => g.id === "critical_dimensions_sourced");
    assert.equal(gate.passed, false);
    assert.match(gate.missing, /revenuePotential/);
    assert.equal(result.allPassed, false);
  });

  await t.test("a missing rationale fails its gate", () => {
    const evidence = fullEvidence({ per: { risk: { rationale: "" } } });
    const gate = evaluateEvidenceGates(evidence).gates.find(
      (g) => g.id === "every_dimension_reasoned",
    );
    assert.equal(gate.passed, false);
  });

  await t.test("repeating one external url does not satisfy the source minimum", () => {
    // Distinctness matters: citing the same page three times is one source.
    const evidence = DIMENSIONS.map((dimension) => ({
      dimension,
      value: 6,
      rationale: "ok",
      source: { kind: "external", url: "https://example.com/same" },
    }));

    const gate = evaluateEvidenceGates(evidence).gates.find(
      (g) => g.id === "min_external_sources",
    );
    assert.equal(gate.passed, false);
    assert.match(gate.missing, new RegExp(`1/${MIN_DISTINCT_EXTERNAL_SOURCES}`));
  });

  await t.test("cosmetic url variants count as one source", () => {
    // The distinct-source gate exists to require three independent sources.
    // Citing one page three ways must not satisfy it.
    const variants = [
      "https://example.com",
      "https://example.com/",
      "https://EXAMPLE.com/#top",
    ];
    const evidence = DIMENSIONS.map((dimension, index) => ({
      dimension,
      value: 6,
      rationale: "ok",
      source:
        index < variants.length
          ? { kind: "external", url: variants[index] }
          : { kind: "none" },
    }));

    const gate = evaluateEvidenceGates(evidence).gates.find(
      (g) => g.id === "min_external_sources",
    );
    assert.equal(gate.passed, false, "three variants of one page are one source");
    assert.match(gate.missing, new RegExp(`1/${MIN_DISTINCT_EXTERNAL_SOURCES}`));
  });

  await t.test("genuinely distinct paths still count separately", () => {
    const evidence = DIMENSIONS.map((dimension, index) => ({
      dimension,
      value: 6,
      rationale: "ok",
      source:
        index < 3
          ? { kind: "external", url: `https://example.com/page-${index}` }
          : { kind: "none" },
    }));

    const gate = evaluateEvidenceGates(evidence).gates.find(
      (g) => g.id === "min_external_sources",
    );
    assert.equal(gate.passed, true);
  });

  await t.test("gates tolerate a malformed rationale without throwing", () => {
    const evidence = fullEvidence({ per: { risk: { rationale: undefined } } });
    const gate = evaluateEvidenceGates(evidence).gates.find(
      (g) => g.id === "every_dimension_reasoned",
    );
    assert.equal(gate.passed, false);
  });

  await t.test("gates report what is missing, not just that something is", () => {
    const evidence = fullEvidence({
      per: { marketPain: { source: { kind: "none" } } },
    });
    for (const gate of evaluateEvidenceGates(evidence).gates) {
      if (!gate.passed) {
        assert.ok(gate.missing && gate.missing.length > 0, `${gate.id} must say what is missing`);
      }
    }
  });
});

test("Venture score proposal — divergence (V7 Phase 1)", async (t) => {
  function proposalAt(value) {
    return buildVentureScoreProposal(baseInput(fullEvidence({ value }))).proposal;
  }

  function actualAt(value) {
    return buildVentureScore(Object.fromEntries(DIMENSIONS.map((d) => [d, value])));
  }

  await t.test("perfect agreement reports zero divergence", () => {
    const result = measureProposalDivergence(proposalAt(7), actualAt(7));

    assert.equal(result.meanAbsoluteDelta, 0);
    assert.deepEqual(result.disagreements, []);
    assert.equal(result.recommendationAgreed, true);
  });

  await t.test("deltas within tolerance are noise, not disagreement", () => {
    const result = measureProposalDivergence(proposalAt(7), actualAt(7 - DIVERGENCE_TOLERANCE));

    assert.equal(result.disagreements.length, 0, "at the tolerance boundary, nothing is flagged");
    assert.equal(result.meanAbsoluteDelta, DIVERGENCE_TOLERANCE);
  });

  await t.test("deltas beyond tolerance are recorded per dimension", () => {
    const result = measureProposalDivergence(proposalAt(9), actualAt(4));

    assert.equal(result.disagreements.length, 11);
    assert.equal(result.disagreements[0].proposed, 9);
    assert.equal(result.disagreements[0].actual, 4);
    assert.equal(result.disagreements[0].delta, 5);
  });

  await t.test("band agreement is reported separately from numeric deltas", () => {
    // Being a little off on every dimension while still reaching the same
    // verdict is a materially better outcome than the reverse, so promotion
    // decisions need to see the two apart.
    const proposal = proposalAt(9);
    const actual = actualAt(8);
    const result = measureProposalDivergence(proposal, actual);

    assert.ok(result.meanAbsoluteDelta > 0, "the numbers differ");
    assert.equal(result.recommendationAgreed, true, "yet the verdict is the same");
    assert.equal(result.proposedRecommendation, result.actualRecommendation);
  });

  await t.test("a band disagreement is surfaced even when deltas look small", () => {
    const result = measureProposalDivergence(proposalAt(8), actualAt(5));

    assert.equal(result.recommendationAgreed, false);
    assert.notEqual(result.proposedRecommendation, result.actualRecommendation);
  });
});
